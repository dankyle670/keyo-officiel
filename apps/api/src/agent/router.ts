import type Anthropic from "@anthropic-ai/sdk";
import { MODEL_TIERS, maxTier, tierAtLeast, tierOfTool, type ModelTier } from "@keyo/shared";

/**
 * L'agent choisit son modèle selon l'action qu'il entreprend.
 * - Chaque demande commence sur le palier le plus léger (Haiku).
 * - Chaque outil a un palier minimal (packages/shared/src/model-tiers.ts) : dès que l'agent choisit
 *   une action d'un palier supérieur, l'étape est reprise par le modèle de ce palier, qui décide
 *   et agit à sa place.
 * - Sans action particulière (une question fiscale, un conseil), l'agent peut monter de lui-même
 *   avec l'outil switch_model.
 * Le palier ne redescend jamais au cours d'une même demande. Modèles réglables par variables d'environnement.
 */
type Effort = "low" | "medium" | "high";
const env = (k: string, d: string) => process.env[k] || d;
export const MODELS: Record<ModelTier, { model: string; effort: Effort }> = {
  FAST: { model: env("KEYO_MODEL_FAST", "claude-haiku-5-5"), effort: "low" },
  STANDARD: { model: env("KEYO_MODEL_STANDARD", "claude-sonnet-5-5"), effort: "medium" },
  EXPERT: { model: env("KEYO_MODEL_EXPERT", "claude-opus-5-5"), effort: "medium" },
};

/**
 * Tarifs Claude par palier, en dollars par million de jetons (entrée, sortie, lecture et écriture
 * du cache 5 minutes), et recherche web (par recherche). Sert au coût par propriétaire.
 */
export const PRICES: Record<ModelTier, { input: number; output: number; cacheRead: number; cacheWrite: number }> = {
  FAST: { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
  STANDARD: { input: 2, output: 10, cacheRead: 0.1, cacheWrite: 2.5 },
  EXPERT: { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
};
export const WEB_SEARCH_USD = 0.01;

export type Usage = { input_tokens: number; output_tokens: number; cache_creation_input_tokens?: number | null; cache_read_input_tokens?: number | null; server_tool_use?: { web_search_requests?: number | null } | null };

/** Coût d'un appel, en millionièmes de dollar (entier). */
export function costOf(tier: ModelTier, u: Usage) {
  const p = PRICES[tier];
  const cacheWrite = u.cache_creation_input_tokens ?? 0;
  const cacheRead = u.cache_read_input_tokens ?? 0;
  const webSearches = u.server_tool_use?.web_search_requests ?? 0;
  const micro = u.input_tokens * p.input + u.output_tokens * p.output + cacheRead * p.cacheRead + cacheWrite * p.cacheWrite + webSearches * WEB_SEARCH_USD * 1e6;
  return { inputTokens: u.input_tokens, outputTokens: u.output_tokens, cacheWrite, cacheRead, webSearches, costMicroUsd: Math.round(micro) };
}

export const SWITCH_MODEL = "switch_model";

/**
 * Outil de montée en gamme. Identique pour tous les modèles : la liste d'outils et le message
 * système ne doivent pas changer d'un modèle à l'autre, sinon l'API refuse l'historique.
 */
export const SWITCH_MODEL_TOOL: Anthropic.Beta.BetaTool = {
  name: SWITCH_MODEL,
  description:
    "Confie la suite de cette demande à un modèle plus capable. STANDARD : agir, rédiger un message délicat, chercher sur le web. EXPERT : fiscalité, droit, contrat, litige, valeur d'un bien, patrimoine, banque, analyse ou plan en plusieurs étapes. Inutile si l'action que vous allez appeler suffit : les actions importantes passent d'elles-mêmes au bon modèle. Si vous êtes déjà au palier demandé, poursuivez sans l'appeler.",
  input_schema: { type: "object", properties: { tier: { type: "string", enum: ["STANDARD", "EXPERT"] }, reason: { type: "string" } }, required: ["tier", "reason"] },
};

type Block = { type: string; name?: string; input?: unknown };

/** Palier exigé par une réponse : actions choisies, recherche web, ou montée demandée par l'agent. */
export function requiredTier(content: Block[]): { tier: ModelTier; reason?: string } {
  let tier: ModelTier = "FAST";
  let reason: string | undefined;
  for (const b of content) {
    if ((b.type === "tool_use" || b.type === "server_tool_use") && b.name) {
      if (b.name === SWITCH_MODEL) {
        const i = b.input as { tier?: ModelTier; reason?: string } | undefined;
        if (i?.tier && MODEL_TIERS.includes(i.tier) && !tierAtLeast(tier, i.tier)) [tier, reason] = [i.tier, i.reason ?? "choix de l'agent"];
        continue;
      }
      const t = tierOfTool(b.name);
      if (!tierAtLeast(tier, t)) [tier, reason] = [t, `action ${b.name}`];
    }
  }
  return { tier, reason };
}

type Msg = { role: "user" | "assistant"; content: string | Block[] };
const isOwnerText = (m: Msg) => m.role === "user" && (typeof m.content === "string" || m.content.some((b) => b.type !== "tool_result"));

/**
 * Palier déjà atteint dans la demande en cours : actions déjà faites depuis le dernier message du
 * propriétaire, et palier renvoyé par l'app à l'étape précédente.
 */
export function startTier(messages: Msg[], fromApp?: ModelTier): ModelTier {
  let tier: ModelTier = fromApp ?? "FAST";
  for (let i = messages.length - 1; i >= 0 && !isOwnerText(messages[i]!); i--) {
    const m = messages[i]!;
    if (m.role === "assistant" && typeof m.content !== "string") tier = maxTier(tier, requiredTier(m.content).tier);
  }
  return tier;
}

/** Tâches internes, au palier fixé une fois pour toutes. */
export const ROUTES = {
  ops: "FAST",
  manager: "STANDARD",
  specialist: "FAST",
} satisfies Record<string, ModelTier>;

/**
 * Paramètres d'un appel selon le palier. Haiku n'a pas de bascule côté serveur. Filet de sécurité :
 * une réflexion produite par un autre modèle et devenue illisible est écartée au lieu d'une erreur.
 */
export function callParams(tier: ModelTier) {
  const m = MODELS[tier];
  const betas = ["thinking-binding-controls-2026-08-01", ...(tier === "FAST" ? [] : ["server-side-fallback-2026-07-01"])] as Anthropic.Beta.AnthropicBeta[];
  return {
    betas,
    ...(tier === "FAST" ? {} : { fallbacks: "default" as const }),
    model: m.model,
    output_config: { effort: m.effort },
    thinking: { type: "adaptive" as const, block_binding: { prefix_mismatch_behavior: "drop_block" as const } },
  };
}
