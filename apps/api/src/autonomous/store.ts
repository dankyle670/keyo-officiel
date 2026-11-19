import { randomUUID } from "node:crypto";
import { z } from "zod";
import { Agreement, Asset, AssetEvent, AssetShare, AssetUnit, Currency, defaultPolicy, Document, Party, ScheduleItem, Transaction, type AutonomyPolicy, type Channel, type Specialist } from "@keyo/shared";

/**
 * Copie des données du propriétaire envoyée par l'app. Passerelle tant que les données vivent
 * sur le téléphone : la base PostgreSQL (Prisma) la remplacera, avec la même interface AgentStore.
 */
export const OwnerSnapshot = z.object({
  ownerName: z.string().max(80).optional(),
  currency: Currency,
  assets: z.array(Asset),
  units: z.array(AssetUnit),
  parties: z.array(Party),
  agreements: z.array(Agreement),
  schedule: z.array(ScheduleItem),
  transactions: z.array(Transaction),
  events: z.array(AssetEvent),
  documents: z.array(Document),
  shares: z.array(AssetShare).default([]),
});
export type OwnerSnapshot = z.infer<typeof OwnerSnapshot>;

export type Trigger = "DAILY" | "WEEKLY" | "MONTHLY" | "PAYMENT_RECEIVED" | "INCIDENT_REPORTED" | "UNIT_VACATED" | "MANUAL";

export type AgentRun = {
  id: string;
  ownerId: string;
  trigger: Trigger;
  /** « claude » : orchestration par les agents ; « playbook » : règles fixes, sans clé. */
  engine: "claude" | "playbook";
  startedAt: string;
  endedAt?: string;
  status: "RUNNING" | "DONE" | "SKIPPED" | "FAILED";
  summary?: string;
};

export type ActionStatus = "DONE" | "PENDING_APPROVAL" | "DEFERRED" | "BLOCKED" | "REJECTED" | "FAILED" | "UNDONE";

/** Journal « Ce que Keyo a fait » : chaque action tentée, avec la décision et son motif. */
export type AgentAction = {
  id: string;
  ownerId: string;
  runId?: string;
  specialist: Specialist;
  action: string;
  input: Record<string, unknown>;
  status: ActionStatus;
  reason: string;
  summary: string;
  notify: boolean;
  createdAt: string;
  updatedAt: string;
  deferredUntil?: string;
  /** Clé d'idempotence : la même action sur le même objet n'est pas refaite. */
  dedupeKey?: string;
};

/** Message envoyé (ou simulé) par un connecteur. */
export type OutboundMessage = {
  id: string;
  ownerId: string;
  actionId: string;
  channel: Channel;
  to: string;
  toName?: string;
  text: string;
  simulated: boolean;
  sentAt: string;
};

/** Modification à appliquer dans l'app (tant que les données sont sur le téléphone). */
export type AppMutation = { id: string; ownerId: string; actionId: string; type: string; payload: Record<string, unknown>; createdAt: string; pulledAt?: string; cancelled?: boolean };

export type ConnectorLink = { ownerId: string; channel: Channel; status: "CONNECTED" | "SIMULATED"; label: string; connectedAt: string };

export interface AgentStore {
  getSnapshot(ownerId: string): OwnerSnapshot | undefined;
  putSnapshot(ownerId: string, s: OwnerSnapshot): void;
  owners(): string[];
  getPolicy(ownerId: string): AutonomyPolicy;
  putPolicy(ownerId: string, p: AutonomyPolicy): void;
  addRun(r: Omit<AgentRun, "id">): AgentRun;
  updateRun(id: string, patch: Partial<AgentRun>): void;
  runs(ownerId: string): AgentRun[];
  addAction(a: Omit<AgentAction, "id" | "createdAt" | "updatedAt">): AgentAction;
  updateAction(id: string, patch: Partial<AgentAction>): AgentAction | undefined;
  action(id: string): AgentAction | undefined;
  actions(ownerId: string, filter?: { status?: ActionStatus }): AgentAction[];
  findByDedupe(ownerId: string, key: string, sinceIso: string): AgentAction | undefined;
  addMessage(m: Omit<OutboundMessage, "id" | "sentAt">): OutboundMessage;
  messages(ownerId: string): OutboundMessage[];
  addMutation(m: Omit<AppMutation, "id" | "createdAt">): AppMutation;
  pullMutations(ownerId: string): AppMutation[];
  cancelMutations(actionId: string): number;
  connectors(ownerId: string): ConnectorLink[];
  putConnector(c: ConnectorLink): void;
}

const now = () => new Date().toISOString();

export class MemoryAgentStore implements AgentStore {
  private snapshots = new Map<string, OwnerSnapshot>();
  private policies = new Map<string, AutonomyPolicy>();
  private runList: AgentRun[] = [];
  private actionList: AgentAction[] = [];
  private messageList: OutboundMessage[] = [];
  private mutationList: AppMutation[] = [];
  private links: ConnectorLink[] = [];

  getSnapshot = (o: string) => this.snapshots.get(o);
  putSnapshot = (o: string, s: OwnerSnapshot) => void this.snapshots.set(o, s);
  owners = () => [...this.snapshots.keys()];
  getPolicy = (o: string) => this.policies.get(o) ?? defaultPolicy(this.snapshots.get(o)?.currency ?? "XOF");
  putPolicy = (o: string, p: AutonomyPolicy) => void this.policies.set(o, p);

  addRun(r: Omit<AgentRun, "id">) {
    const run = { ...r, id: randomUUID() };
    this.runList.push(run);
    return run;
  }
  updateRun(id: string, patch: Partial<AgentRun>) {
    const r = this.runList.find((x) => x.id === id);
    if (r) Object.assign(r, patch);
  }
  runs = (o: string) => this.runList.filter((r) => r.ownerId === o).reverse();

  addAction(a: Omit<AgentAction, "id" | "createdAt" | "updatedAt">) {
    const t = now();
    const action = { ...a, id: randomUUID(), createdAt: t, updatedAt: t };
    this.actionList.push(action);
    return action;
  }
  updateAction(id: string, patch: Partial<AgentAction>) {
    const a = this.actionList.find((x) => x.id === id);
    if (a) Object.assign(a, patch, { updatedAt: now() });
    return a;
  }
  action = (id: string) => this.actionList.find((a) => a.id === id);
  actions = (o: string, f?: { status?: ActionStatus }) => this.actionList.filter((a) => a.ownerId === o && (!f?.status || a.status === f.status)).reverse();
  findByDedupe = (o: string, key: string, since: string) =>
    this.actionList.find((a) => a.ownerId === o && a.dedupeKey === key && a.createdAt >= since && (a.status === "DONE" || a.status === "PENDING_APPROVAL" || a.status === "DEFERRED"));

  addMessage(m: Omit<OutboundMessage, "id" | "sentAt">) {
    const msg = { ...m, id: randomUUID(), sentAt: now() };
    this.messageList.push(msg);
    return msg;
  }
  messages = (o: string) => this.messageList.filter((m) => m.ownerId === o).reverse();

  addMutation(m: Omit<AppMutation, "id" | "createdAt">) {
    const mut = { ...m, id: randomUUID(), createdAt: now() };
    this.mutationList.push(mut);
    return mut;
  }
  pullMutations(o: string) {
    const out = this.mutationList.filter((m) => m.ownerId === o && !m.pulledAt && !m.cancelled);
    const t = now();
    for (const m of out) m.pulledAt = t;
    return out;
  }
  cancelMutations(actionId: string) {
    const pending = this.mutationList.filter((m) => m.actionId === actionId && !m.pulledAt && !m.cancelled);
    for (const m of pending) m.cancelled = true;
    return pending.length;
  }
  connectors = (o: string) => this.links.filter((l) => l.ownerId === o);
  putConnector(c: ConnectorLink) {
    this.links = this.links.filter((l) => !(l.ownerId === c.ownerId && l.channel === c.channel));
    this.links.push(c);
  }
}
