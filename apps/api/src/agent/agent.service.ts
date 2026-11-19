import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { Inject, Injectable } from "@nestjs/common";
import { z } from "zod";
import { agentToolSchemas, type AuditFinding } from "@keyo/shared";
import { AGENT_SYSTEM, OPS_SYSTEM } from "./prompts.ts";

export const ANTHROPIC = Symbol("ANTHROPIC");
export const MODEL = process.env.KEYO_AGENT_MODEL ?? "claude-opus-5-5";
type Effort = "low" | "medium" | "high";
const EFFORT = (process.env.KEYO_AGENT_EFFORT ?? "medium") as Effort;

export const TurnContext = z.object({
  today: z.iso.date(),
  ownerName: z.string().max(80).optional(),
  currency: z.string().length(3),
});
export type TurnContext = z.infer<typeof TurnContext>;

/** Historique renvoyé tel quel par l'app (blocs de réflexion compris, à repasser sans modification). */
export const TurnBody = z.object({
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.union([z.string(), z.array(z.any())]) })).min(1).max(200),
  context: TurnContext,
});

export const OpsBody = z.object({
  findings: z.array(z.object({ id: z.string(), severity: z.string(), area: z.string(), title: z.string(), detail: z.string() })).max(200),
  score: z.number(),
  context: TurnContext,
});

export const OpsReview = z.object({
  verdict: z.string().describe("Une ou deux phrases : la gestion est-elle en ordre ?"),
  priorities: z
    .array(z.object({ findingId: z.string(), why: z.string(), nextStep: z.string() }))
    .describe("Au plus cinq points à traiter en premier, dans l'ordre"),
});
export type OpsReview = z.infer<typeof OpsReview>;

// Repli côté serveur si le modèle décline une requête (catégorie de refus gérée par l'API).
const fallback = () => ({ betas: ["server-side-fallback-2026-07-01"] as Anthropic.Beta.AnthropicBeta[], fallbacks: "default" as const });

const contextBlock = (c: TurnContext) =>
  `Date du jour : ${c.today}. Devise d'affichage : ${c.currency}.${c.ownerName ? ` Propriétaire : ${c.ownerName}.` : ""}`;

@Injectable()
export class AgentService {
  private readonly tools = agentToolSchemas();

  constructor(@Inject(ANTHROPIC) private readonly client: Anthropic | null) {}

  /** « claude » si une clé est configurée ; sinon l'app bascule sur son mode démo local. */
  status() {
    return { mode: this.client ? ("claude" as const) : ("demo" as const), model: this.client ? MODEL : undefined };
  }

  /**
   * Un tour de l'agent. La boucle est tenue par l'app : quand Claude demande un outil
   * (stop_reason « tool_use »), l'app l'exécute sur ses données et renvoie le résultat.
   */
  async turn(body: z.infer<typeof TurnBody>) {
    if (!this.client) return null;
    const tools = this.tools.map((t, i) => (i === this.tools.length - 1 ? { ...t, cache_control: { type: "ephemeral" as const } } : t));
    const res = await this.client.beta.messages.create({
      ...fallback(),
      model: MODEL,
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      output_config: { effort: EFFORT },
      system: [
        { type: "text", text: AGENT_SYSTEM, cache_control: { type: "ephemeral" } },
        { type: "text", text: contextBlock(body.context) },
      ],
      tools,
      messages: body.messages as Anthropic.Beta.BetaMessageParam[],
    });
    return { content: res.content, stop_reason: res.stop_reason, model: res.model };
  }

  /** Sous-agent « ops » : priorise les points du contrôle de gestion, sans en inventer. */
  async ops(body: z.infer<typeof OpsBody>): Promise<OpsReview | null> {
    if (!this.client) return null;
    if (body.findings.length === 0) return { verdict: "Tout est en ordre : aucun point à traiter.", priorities: [] };
    const res = await this.client.beta.messages.parse({
      ...fallback(),
      model: MODEL,
      max_tokens: 8000,
      output_config: { effort: "low", format: betaZodOutputFormat(OpsReview) },
      system: [
        { type: "text", text: OPS_SYSTEM, cache_control: { type: "ephemeral" } },
        { type: "text", text: contextBlock(body.context) },
      ],
      messages: [{ role: "user", content: `Score de gestion : ${body.score}/100.\nPoints relevés :\n${JSON.stringify(body.findings satisfies Pick<AuditFinding, "id" | "title" | "detail">[])}` }],
    });
    const review = res.parsed_output as OpsReview | null;
    if (res.stop_reason === "refusal" || !review) return null;
    const known = new Set(body.findings.map((f) => f.id));
    // Garde-fou : le sous-agent ne peut citer que des points réellement relevés.
    return { verdict: review.verdict, priorities: review.priorities.filter((p) => known.has(p.findingId)).slice(0, 5) };
  }
}
