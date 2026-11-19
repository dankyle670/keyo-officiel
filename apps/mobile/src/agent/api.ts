import Constants from "expo-constants";
import type { AuditFinding } from "@keyo/shared";

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
export type TurnResponse = { content: ContentBlock[]; stop_reason: string | null };
export type OpsReview = { verdict: string; priorities: { findingId: string; why: string; nextStep: string }[] };

export class AgentUnavailable extends Error {}

async function call<T>(path: string, init: RequestInit = {}, timeoutMs = 90_000): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${apiBase()}${path}`, { ...init, signal: ctrl.signal, headers: { "content-type": "application/json" } });
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

export const postTurn = (messages: ApiMessage[], context: TurnContext) => call<TurnResponse>("/agent/turn", { method: "POST", body: JSON.stringify({ messages, context }) });

export const postOps = (findings: AuditFinding[], score: number, context: TurnContext) =>
  call<OpsReview>("/agent/ops", {
    method: "POST",
    body: JSON.stringify({ findings: findings.map(({ id, severity, area, title, detail }) => ({ id, severity, area, title, detail })), score, context }),
  }, 60_000);
