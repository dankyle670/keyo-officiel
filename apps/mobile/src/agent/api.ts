import Constants from "expo-constants";
import type { AuditFinding } from "@keyo/shared";
import { getSession } from "@/data/session";

/**
 * Accès au serveur Keyo (apps/api). En développement, l'API tourne sur la même machine que Metro :
 * on reprend l'adresse du serveur Metro, port 3000. EXPO_PUBLIC_API_URL l'emporte si défini.
 */
export function apiBase(): string {
  const env = process.env.EXPO_PUBLIC_API_URL;
  if (env) return env.replace(/\/$/, "");
  const host = Constants.expoConfig?.hostUri?.split(":")[0] ?? "localhost";
  return `http://${host}:3000`;
}

/** Message au format de l'API Claude, conservé tel quel par l'app (blocs de réflexion compris). */
export type ApiMessage = { role: "user" | "assistant"; content: string | Record<string, unknown>[] };
export type TurnContext = { today: string; currency: string; ownerName?: string };
export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: string; [k: string]: unknown };
export type TurnResponse = {
  content: ContentBlock[];
  stop_reason: string | null;
  model?: string;
  tier?: "FAST" | "STANDARD" | "EXPERT";
  /** Abonnement en lecture seule : l'agent n'agit plus. */
  locked?: boolean;
  /** stop_reason « expert_quota » : analyses d'expert de la formule épuisées, accord requis. */
  quota?: { remaining: number; included: number; extraPrice: { amount: number; currency: string } };
};
export type OpsReview = { verdict: string; priorities: { findingId: string; why: string; nextStep: string }[] };

export class AgentUnavailable extends Error {}

async function call<T>(path: string, init: RequestInit = {}, timeoutMs = 90_000): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  // Arrêt demandé par le propriétaire (bouton Arrêter du chat).
  init.signal?.addEventListener("abort", () => ctrl.abort());
  try {
    const s = getSession();
    const owner = s.status === "signedIn" ? s.user.id.replace(/[^\w-]/g, "").slice(0, 64) : "";
    const res = await fetch(`${apiBase()}${path}`, { ...init, signal: ctrl.signal, headers: { "content-type": "application/json", ...(owner ? { "x-keyo-owner": owner } : {}) } });
    const body = await res.json().catch(() => ({}));
    if (res.status === 503 && body?.mode === "demo") throw new AgentUnavailable("demo");
    if (!res.ok) throw new Error(typeof body?.error === "string" ? body.error : "L'agent est momentanément indisponible.");
    return body as T;
  } finally {
    clearTimeout(timer);
  }
}

/** « claude » si le serveur a une clé, « demo » sinon ou s'il est injoignable. */
export async function agentMode(): Promise<{ mode: "claude" | "demo"; reachable: boolean }> {
  try {
    const r = await call<{ mode: "claude" | "demo" }>("/agent/status", {}, 4000);
    return { mode: r.mode, reachable: true };
  } catch {
    return { mode: "demo", reachable: false };
  }
}

/** `tier` : palier de modèle déjà atteint dans la demande en cours (le serveur ne redescend pas). */
export const postTurn = (messages: ApiMessage[], context: TurnContext, signal?: AbortSignal, tier?: TurnResponse["tier"], expertConsent?: boolean) =>
  call<TurnResponse>("/agent/turn", { method: "POST", body: JSON.stringify({ messages, context, tier, expertConsent }), signal });

export const postOps = (findings: AuditFinding[], score: number, context: TurnContext) =>
  call<OpsReview>("/agent/ops", {
    method: "POST",
    body: JSON.stringify({ findings: findings.map(({ id, severity, area, title, detail }) => ({ id, severity, area, title, detail })), score, context }),
  }, 60_000);

/** Aperçu d'une page web citée (titre, site, image, icône), lu par le serveur. */
export type LinkPreview = { url: string; title?: string; site?: string; description?: string; image?: string; icon?: string };

export function fetchPreviews(urls: string[]) {
  return call<LinkPreview[]>("/agent/previews", { method: "POST", body: JSON.stringify({ urls }) }, 15_000);
}
