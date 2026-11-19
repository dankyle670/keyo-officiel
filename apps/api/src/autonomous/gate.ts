import { actionDef, decideAutonomy, isAutonomousAction, type AutonomousAction, type Specialist } from "@keyo/shared";
import { prepare, type Prepared } from "./actions.ts";
import type { ConnectorRegistry } from "./connectors.ts";
import type { AgentAction, AgentStore } from "./store.ts";
import { localHour } from "./views.ts";

export type Clock = () => Date;
export type GateOutcome =
  | { status: AgentAction["status"]; actionId: string; summary: string; reason: string }
  | { status: "INVALID" | "DUPLICATE"; reason: string };

/**
 * Seul chemin par lequel un agent agit. Ordre fixe : valider l'entrée contre les données réelles,
 * éviter les doublons, appliquer la politique d'autonomie (code, pas IA), exécuter via les
 * connecteurs, tout consigner au journal.
 */
export class ActionGate {
  constructor(
    private readonly store: AgentStore,
    private readonly connectors: ConnectorRegistry,
    private readonly clock: Clock = () => new Date(),
  ) {}

  private today = () => this.clock().toISOString().slice(0, 10);

  async propose(p: { ownerId: string; runId?: string; specialist: Specialist; action: string; input: unknown }): Promise<GateOutcome> {
    if (!isAutonomousAction(p.action)) return { status: "INVALID", reason: "Action hors du catalogue : interdite." };
    const s = this.store.getSnapshot(p.ownerId);
    if (!s) return { status: "INVALID", reason: "Données du propriétaire indisponibles." };
    const prep = prepare(p.action, p.input, s, this.today());
    if (!prep.ok) return { status: "INVALID", reason: prep.error };
    const v = prep.value;
    if (v.dedupeKey) {
      const since = v.dedupeDays ? new Date(this.clock().getTime() - v.dedupeDays * 86_400_000).toISOString() : "";
      const prev = this.store.findByDedupe(p.ownerId, v.dedupeKey, since);
      if (prev) return { status: "DUPLICATE", reason: `Déjà fait ou en attente : ${prev.summary} (${prev.createdAt.slice(0, 10)}).` };
    }
    const record = this.store.addAction({
      ownerId: p.ownerId,
      runId: p.runId,
      specialist: p.specialist,
      action: p.action,
      input: p.input as Record<string, unknown>,
      status: "FAILED",
      reason: "",
      summary: v.summary,
      notify: false,
      dedupeKey: v.dedupeKey,
    });
    return this.decideAndRun(record, p.action, v, false);
  }

  /** Le propriétaire accepte une action en attente : elle est revérifiée sur les données du moment. */
  async approve(ownerId: string, actionId: string): Promise<GateOutcome> {
    const a = this.store.action(actionId);
    if (!a || a.ownerId !== ownerId || a.status !== "PENDING_APPROVAL") return { status: "INVALID", reason: "Aucune demande en attente avec cet identifiant." };
    return this.rerun(a, true);
  }

  reject(ownerId: string, actionId: string): GateOutcome {
    const a = this.store.action(actionId);
    if (!a || a.ownerId !== ownerId || a.status !== "PENDING_APPROVAL") return { status: "INVALID", reason: "Aucune demande en attente avec cet identifiant." };
    this.store.updateAction(a.id, { status: "REJECTED", reason: "Refusée par le propriétaire." });
    return { status: "REJECTED", actionId: a.id, summary: a.summary, reason: "Refusée par le propriétaire." };
  }

  /** Annule une action tant qu'elle n'a pas produit d'effet hors de Keyo. */
  undo(ownerId: string, actionId: string): GateOutcome {
    const a = this.store.action(actionId);
    if (!a || a.ownerId !== ownerId) return { status: "INVALID", reason: "Action introuvable." };
    if (a.status === "DEFERRED") {
      this.store.updateAction(a.id, { status: "UNDONE", reason: "Annulée avant envoi." });
      return { status: "UNDONE", actionId: a.id, summary: a.summary, reason: "Annulée avant envoi." };
    }
    if (a.status !== "DONE" || !isAutonomousAction(a.action) || !actionDef(a.action).undoable) return { status: "INVALID", reason: "Cette action ne peut pas être annulée (message déjà envoyé)." };
    if (this.store.cancelMutations(a.id) === 0) return { status: "INVALID", reason: "Déjà appliquée dans l'application : modifiez-la directement." };
    this.store.updateAction(a.id, { status: "UNDONE", reason: "Annulée par le propriétaire." });
    return { status: "UNDONE", actionId: a.id, summary: a.summary, reason: "Annulée par le propriétaire." };
  }

  /** Relance les actions différées (heures calmes) dont l'heure est venue. */
  async flushDeferred(ownerId: string): Promise<GateOutcome[]> {
    const due = this.store.actions(ownerId, { status: "DEFERRED" });
    const out: GateOutcome[] = [];
    for (const a of due) out.push(await this.rerun(a, a.reason.startsWith("Accord")));
    return out;
  }

  private async rerun(a: AgentAction, approved: boolean): Promise<GateOutcome> {
    const s = this.store.getSnapshot(a.ownerId);
    if (!s || !isAutonomousAction(a.action)) return { status: "INVALID", reason: "Données indisponibles." };
    const prep = prepare(a.action, a.input, s, this.today());
    if (!prep.ok) {
      this.store.updateAction(a.id, { status: "FAILED", reason: `N'est plus d'actualité : ${prep.error}` });
      return { status: "FAILED", actionId: a.id, summary: a.summary, reason: prep.error };
    }
    return this.decideAndRun(a, a.action, prep.value, approved);
  }

  private async decideAndRun(a: AgentAction, action: AutonomousAction, v: Prepared, approved: boolean): Promise<GateOutcome> {
    const s = this.store.getSnapshot(a.ownerId)!;
    const asset = s.assets.find((x) => x.id === v.assetId) ?? s.assets[0];
    const decision = decideAutonomy(this.store.getPolicy(a.ownerId), { action, spend: v.spend, localHour: localHour(asset, this.clock()), approved });
    const done = (status: AgentAction["status"], reason: string, extra: Partial<AgentAction> = {}): GateOutcome => {
      this.store.updateAction(a.id, { status, reason, summary: v.summary, ...extra });
      return { status, actionId: a.id, summary: v.summary, reason };
    };

    if (decision.kind === "BLOCKED") return done("BLOCKED", decision.reason);
    if (decision.kind === "ASK") return done("PENDING_APPROVAL", decision.reason);
    if (decision.kind === "DEFER") return done("DEFERRED", approved ? `Accord donné. ${decision.reason}` : decision.reason, { deferredUntil: decision.until });

    for (const msg of v.sends) {
      const res = await this.connectors.get(msg.channel).send(msg);
      if (!res.ok) return done("FAILED", res.error);
      this.store.addMessage({ ownerId: a.ownerId, actionId: a.id, channel: msg.channel, to: msg.to, toName: msg.toName, text: msg.text, simulated: res.simulated });
    }
    for (const m of v.mutations) this.store.addMutation({ ownerId: a.ownerId, actionId: a.id, type: m.type, payload: m.payload });
    return done("DONE", decision.reason, { notify: decision.notify });
  }
}
