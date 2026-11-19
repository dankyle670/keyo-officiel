import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { Inject, Injectable } from "@nestjs/common";
import { z } from "zod";
import { agentToolSchemas, type AuditFinding } from "@keyo/shared";
import { AGENT_SYSTEM, OPS_SYSTEM } from "./prompts.ts";
import { callParams, MODELS, requiredTier, ROUTES, startTier, SWITCH_MODEL_TOOL } from "./router.ts";
import { MODEL_TIERS, tierAtLeast, type ModelTier } from "@keyo/shared";

export const ANTHROPIC = Symbol("ANTHROPIC");

const WEB_SEARCH = { type: "web_search_20260209" as const, name: "web_search" as const, max_uses: 5 };

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
  /** Palier atteint à l'étape précédente de la même demande (renvoyé par l'app). */
  tier: z.enum(MODEL_TIERS).optional(),
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

const contextBlock = (c: TurnContext) =>
  `Date du jour : ${c.today}. Devise d'affichage : ${c.currency}.${c.ownerName ? ` Propriétaire : ${c.ownerName}.` : ""}`;

@Injectable()
export class AgentService {
  private readonly tools = agentToolSchemas();

  constructor(@Inject(ANTHROPIC) private readonly client: Anthropic | null) {}

  /** « claude » si une clé est configurée ; sinon l'app bascule sur son mode démo local. */
  status() {
    return { mode: this.client ? ("claude" as const) : ("demo" as const), model: this.client ? `auto (${Object.values(MODELS).map((m) => m.model).join(", ")})` : undefined };
  }

  /**
   * Un tour de l'agent. La boucle est tenue par l'app : quand Claude demande un outil
   * (stop_reason « tool_use »), l'app l'exécute sur ses données et renvoie le résultat.
   */
  async turn(body: z.infer<typeof TurnBody>) {
    if (!this.client) return null;
    const messages = body.messages as Anthropic.Beta.BetaMessageParam[];
    let tier = startTier(body.messages as Parameters<typeof startTier>[0], body.tier);
    let reason: string | undefined;
    // L'agent commence léger ; s'il choisit une action d'un palier supérieur (ou le demande avec
    // switch_model), l'étape est reprise par le modèle de ce palier. Au plus deux reprises.
    for (let attempt = 0; ; attempt++) {
      const res = await this.call(tier, body.context, messages);
      const need = requiredTier(res.content as Parameters<typeof requiredTier>[0]);
      if (attempt < 2 && !tierAtLeast(tier, need.tier) && res.stop_reason !== "refusal") {
        [tier, reason] = [need.tier, need.reason];
        continue;
      }
      return { content: res.content, stop_reason: res.stop_reason, model: res.model, tier, reason };
    }
  }

  private call(tier: ModelTier, context: TurnContext, messages: Anthropic.Beta.BetaMessageParam[]) {
    // Mêmes outils et même message système pour tous les modèles (condition pour changer de modèle
    // en cours de demande). La recherche web choisie par Haiku fait reprendre l'étape par Sonnet.
    const tools = [WEB_SEARCH, SWITCH_MODEL_TOOL, ...this.tools.map((t, i) => (i === this.tools.length - 1 ? { ...t, cache_control: { type: "ephemeral" as const } } : t))];
    return this.client!.beta.messages.create({
      ...callParams(tier),
      max_tokens: 16000,
      system: [
        { type: "text", text: AGENT_SYSTEM, cache_control: { type: "ephemeral" } },
        { type: "text", text: contextBlock(context) },
      ],
      tools: tools as Anthropic.Beta.BetaToolUnion[],
      messages,
    });
  }

  /** Sous-agent « ops » : priorise les points du contrôle de gestion, sans en inventer. */
  async ops(body: z.infer<typeof OpsBody>): Promise<OpsReview | null> {
    if (!this.client) return null;
    if (body.findings.length === 0) return { verdict: "Tout est en ordre : aucun point à traiter.", priorities: [] };
    const res = await this.client.beta.messages.parse({
      ...callParams(ROUTES.ops),
      max_tokens: 8000,
      output_config: { effort: MODELS[ROUTES.ops].effort, format: betaZodOutputFormat(OpsReview) },
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
