import type { AutonomyLevel, AutonomyPolicy, Channel, Specialist } from "@keyo/shared";
import { apiBase } from "@/agent/api";
import type { AgentMutation } from "@/data/store";

/** Client des agents autonomes (apps/api, /autonomous). */

export type CatalogItem = {
  key: string;
  label: string;
  description: string;
  specialist: Specialist;
  specialistLabel: string;
  level: AutonomyLevel;
  maxLevel: AutonomyLevel;
  spends: boolean;
  channels: Channel[];
};
export type ActionStatus = "DONE" | "PENDING_APPROVAL" | "DEFERRED" | "BLOCKED" | "REJECTED" | "FAILED" | "UNDONE";
export type JournalEntry = {
  id: string;
  specialist: Specialist;
  action: string;
  status: ActionStatus;
  reason: string;
  summary: string;
  notify: boolean;
  createdAt: string;
  deferredUntil?: string;
};
export type AgentRun = { id: string; trigger: string; engine: "claude" | "playbook"; status: "RUNNING" | "DONE" | "SKIPPED" | "FAILED"; summary?: string; startedAt: string };
export type OutboundMessage = { id: string; actionId: string; channel: Channel; to: string; toName?: string; text: string; simulated: boolean; sentAt: string };
export type ConnectorInfo = { channel: Channel; label: string; simulated: boolean };

let ownerId = "";
/** Identifiant du propriétaire envoyé au serveur (provisoire, avant la connexion par SMS). */
export const setAutonomousOwner = (id: string) => {
  ownerId = id.replace(/[^\w-]/g, "").slice(0, 64);
};

async function call<T>(path: string, init: { method?: string; body?: unknown } = {}, timeoutMs = 20_000): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${apiBase()}/autonomous${path}`, {
      method: init.method ?? "GET",
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: ctrl.signal,
      headers: { "content-type": "application/json", "x-keyo-owner": ownerId },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(typeof body?.error === "string" ? body.error : "Serveur Keyo indisponible.");
    return body as T;
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") throw new Error("Serveur Keyo injoignable.");
    if (e instanceof TypeError) throw new Error("Serveur Keyo injoignable.");
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export const autonomousApi = {
  putSnapshot: (snapshot: unknown) => call<{ ok: true }>("/snapshot", { method: "PUT", body: snapshot }),
  pullMutations: () => call<AgentMutation[]>("/mutations/pull", { method: "POST" }),
  policy: () => call<AutonomyPolicy>("/policy"),
  setPolicy: (p: AutonomyPolicy) => call<AutonomyPolicy>("/policy", { method: "PUT", body: p }),
  catalog: () => call<CatalogItem[]>("/catalog"),
  run: () => call<AgentRun>("/run", { method: "POST", body: { trigger: "MANUAL" } }, 120_000),
  runs: () => call<AgentRun[]>("/runs"),
  journal: () => call<JournalEntry[]>("/journal"),
  messages: () => call<OutboundMessage[]>("/messages"),
  approve: (id: string) => call<JournalEntry>(`/actions/${id}/approve`, { method: "POST" }),
  reject: (id: string) => call<JournalEntry>(`/actions/${id}/reject`, { method: "POST" }),
  undo: (id: string) => call<JournalEntry>(`/actions/${id}/undo`, { method: "POST" }),
  connectors: () => call<ConnectorInfo[]>("/connectors"),
};
