import type Anthropic from "@anthropic-ai/sdk";
import { formatMoney, SPECIALIST_LABEL, type AutonomousAction, type Specialist } from "@keyo/shared";
import { MODEL } from "../agent/agent.service.ts";
import type { ActionGate, Clock, GateOutcome } from "./gate.ts";
import { frDate } from "./actions.ts";
import { isActionOf, isRead, runRead, SPECIALIST_SYSTEM, specialistTools } from "./specialists.ts";
import type { AgentRun, AgentStore, OwnerSnapshot, Trigger } from "./store.ts";
import { craftsmen, endingAgreements, monthSummary, openIncidents, overdueRents, recentlyPaid, vacantUnits } from "./views.ts";

type Msg = Anthropic.Beta.BetaMessageParam;
type Tool = { name: string; description: string; input_schema: { type: "object"; [k: string]: unknown } };
type Exec = (name: string, input: unknown) => Promise<unknown>;

const MAX_STEPS = 10;
const BACKGROUND_EFFORT = (process.env.KEYO_AUTONOMOUS_EFFORT ?? "low") as "low" | "medium" | "high";

/** Qui réveiller pour ce déclencheur : décidé par le code, pour ne jamais appeler Claude à vide. */
export function wake(trigger: Trigger, s: OwnerSnapshot, today: string): { specialist: Specialist; why: string }[] {
  const out: { specialist: Specialist; why: string }[] = [];
  const overdue = overdueRents(s, today);
  const paid = recentlyPaid(s, today, 3);
  const incidents = openIncidents(s).filter((i) => !i.triaged || i.status === "OPEN");
  const vacant = vacantUnits(s, today);
  const ending = endingAgreements(s, today);
  const daily = trigger === "DAILY" || trigger === "MANUAL";
  const weekly = trigger === "WEEKLY" || trigger === "MANUAL";

  if ((daily || trigger === "PAYMENT_RECEIVED") && (overdue.length || paid.length))
    out.push({ specialist: "COLLECTION", why: `${overdue.length} échéance(s) en retard, ${paid.length} paiement(s) récent(s) à quittancer` });
  if ((daily || trigger === "INCIDENT_REPORTED") && incidents.length) out.push({ specialist: "MAINTENANCE", why: `${incidents.length} incident(s) à traiter` });
  if ((weekly || trigger === "UNIT_VACATED") && vacant.length) out.push({ specialist: "RELETTING", why: `${vacant.length} logement(s) vacant(s)` });
  if (weekly) out.push({ specialist: "COMPLIANCE", why: `contrôle hebdomadaire${ending.length ? `, ${ending.length} contrat(s) en fin de période` : ""}` });
  if (trigger === "MONTHLY") out.push({ specialist: "FINANCE", why: "rapport du mois" });
  return out;
}

const fallback = () => ({ betas: ["server-side-fallback-2026-07-01"] as Anthropic.Beta.AnthropicBeta[], fallbacks: "default" as const });
const textOf = (content: Anthropic.Beta.BetaContentBlock[]) =>
  content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();

/**
 * Orchestration : un agent Gérant répartit le travail entre des agents spécialisés (Encaissement,
 * Relocation, Entretien, Conformité, Finances), chacun avec ses propres outils. Toutes les actions
 * passent par l'ActionGate. Sans clé Claude, des règles fixes (playbook) jouent le même rôle.
 */
export class Orchestrator {
  constructor(
    private readonly store: AgentStore,
    private readonly gate: ActionGate,
    private readonly client: Anthropic | null,
    private readonly clock: Clock = () => new Date(),
  ) {}

  async run(ownerId: string, trigger: Trigger, note?: string): Promise<AgentRun> {
    const today = this.clock().toISOString().slice(0, 10);
    const s = this.store.getSnapshot(ownerId);
    const run = this.store.addRun({ ownerId, trigger, engine: this.client ? "claude" : "playbook", startedAt: this.clock().toISOString(), status: "RUNNING" });
    const finish = (status: AgentRun["status"], summary: string) => {
      this.store.updateRun(run.id, { status, summary, endedAt: this.clock().toISOString() });
      return { ...run, status, summary };
    };
    if (!s) return finish("FAILED", "Données du propriétaire indisponibles : ouvrez l'application pour les synchroniser.");

    const deferred = await this.gate.flushDeferred(ownerId);
    const work = wake(trigger, s, today);
    if (!work.length) return finish(deferred.length ? "DONE" : "SKIPPED", deferred.length ? `${deferred.length} action(s) différée(s) reprise(s).` : "Rien à faire.");

    try {
      const ctx = `Date du jour : ${today}. Déclencheur : ${trigger}.${note ? ` Précision : ${note}.` : ""}${s.ownerName ? ` Propriétaire : ${s.ownerName}.` : ""}`;
      const summary = this.client ? await this.manage(this.client, ownerId, run.id, work, ctx) : await this.playbook(ownerId, run.id, work, s, today);
      return finish("DONE", summary);
    } catch (e) {
      return finish("FAILED", e instanceof Error ? `Échec : ${e.message.slice(0, 200)}` : "Échec.");
    }
  }

  /** Gérant : un seul spécialiste réveillé = délégation directe ; plusieurs = le Gérant priorise et délègue. */
  private async manage(client: Anthropic, ownerId: string, runId: string, work: { specialist: Specialist; why: string }[], ctx: string) {
    if (work.length === 1) return this.specialist(client, ownerId, runId, work[0]!.specialist, `Traitez : ${work[0]!.why}.`, ctx);
    const allowed = work.map((w) => w.specialist);
    const reports: string[] = [];
    const tools: Tool[] = [
      {
        name: "delegate",
        description: "Confie une tâche précise à un agent spécialisé et renvoie son compte rendu.",
        input_schema: { type: "object", properties: { specialist: { type: "string", enum: allowed }, task: { type: "string" } }, required: ["specialist", "task"] },
      },
    ];
    const system = `Vous êtes le Gérant de Keyo : vous coordonnez des agents spécialisés qui gèrent les biens d'un propriétaire à la place d'une agence. Priorisez (argent dû et urgences d'abord), déléguez chaque sujet une fois au bon agent avec une consigne précise, puis rédigez pour le propriétaire un compte rendu de trois à cinq phrases, en français et au vouvoiement : ce qui a été fait, ce qui attend son accord.`;
    const final = await this.loop(client, system, ctx, `À traiter :\n${work.map((w) => `- ${SPECIALIST_LABEL[w.specialist]} (${w.specialist}) : ${w.why}`).join("\n")}`, tools, async (name, input) => {
      const { specialist, task } = (input ?? {}) as { specialist?: Specialist; task?: string };
      if (name !== "delegate" || !specialist || !allowed.includes(specialist) || !task) return { error: "Délégation invalide." };
      const report = await this.specialist(client, ownerId, runId, specialist, task, ctx);
      reports.push(`${SPECIALIST_LABEL[specialist]} : ${report}`);
      return { report };
    });
    return final || reports.join("\n");
  }

  private specialist(client: Anthropic, ownerId: string, runId: string, sp: Specialist, task: string, ctx: string) {
    const today = this.clock().toISOString().slice(0, 10);
    return this.loop(client, SPECIALIST_SYSTEM(sp), ctx, task, specialistTools(sp), async (name, input) => {
      const s = this.store.getSnapshot(ownerId);
      if (!s) return { error: "Données indisponibles." };
      if (isRead(name) && specialistTools(sp).some((t) => t.name === name)) return runRead(name, s, today);
      if (isActionOf(sp, name)) return this.gate.propose({ ownerId, runId, specialist: sp, action: name, input });
      return { error: `Outil « ${name} » non autorisé pour cet agent.` };
    });
  }

  /** Boucle d'outils : appelle Claude, exécute les outils demandés, renvoie les résultats, jusqu'à la réponse finale. */
  private async loop(client: Anthropic, system: string, ctx: string, prompt: string, tools: Tool[], exec: Exec): Promise<string> {
    const messages: Msg[] = [{ role: "user", content: prompt }];
    const cached = tools.map((t, i) => (i === tools.length - 1 ? { ...t, cache_control: { type: "ephemeral" as const } } : t));
    for (let step = 0; step < MAX_STEPS; step++) {
      const res = await client.beta.messages.create({
        ...fallback(),
        model: MODEL,
        max_tokens: 8000,
        thinking: { type: "adaptive" },
        output_config: { effort: BACKGROUND_EFFORT },
        system: [
          { type: "text", text: system, cache_control: { type: "ephemeral" } },
          { type: "text", text: ctx },
        ],
        tools: cached as Anthropic.Beta.BetaToolUnion[],
        messages,
      });
      messages.push({ role: "assistant", content: res.content as Anthropic.Beta.BetaContentBlockParam[] });
      if (res.stop_reason !== "tool_use") return textOf(res.content);
      const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
      for (const block of res.content) {
        if (block.type !== "tool_use") continue;
        const out = await exec(block.name, block.input).catch((e: unknown) => ({ error: e instanceof Error ? e.message : "Erreur" }));
        const isError = typeof out === "object" && out !== null && "error" in out;
        results.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(out ?? null), ...(isError ? { is_error: true } : {}) });
      }
      messages.push({ role: "user", content: results });
    }
    return "Limite d'étapes atteinte : le reste sera traité au prochain passage.";
  }

  /** Sans clé Claude : règles fixes, prudentes, passant par le même contrôle d'autonomie. */
  private async playbook(ownerId: string, runId: string, work: { specialist: Specialist }[], s: OwnerSnapshot, today: string) {
    const outcomes: GateOutcome[] = [];
    const act = async (specialist: Specialist, action: AutonomousAction, input: unknown) => outcomes.push(await this.gate.propose({ ownerId, runId, specialist, action, input }));
    const sign = "Keyo, pour le compte de votre propriétaire";

    for (const { specialist } of work) {
      if (specialist === "COLLECTION") {
        for (const o of overdueRents(s, today)) {
          const first = o.occupant.split(" ")[0];
          if (o.daysLate >= 10) await act(specialist, "send_payment_link", { scheduleItemId: o.scheduleItemId, message: `Bonjour ${first}, votre loyer du ${frDate(o.dueDate)} (${o.due}) reste à régler. Vous pouvez payer directement par ce lien. ${sign}.` });
          else if (o.daysLate >= 1) await act(specialist, "send_rent_reminder", { scheduleItemId: o.scheduleItemId, message: `Bonjour ${first}, sauf erreur de notre part, le loyer du ${frDate(o.dueDate)} (${o.due}) n'est pas encore réglé. Merci de faire le nécessaire. ${sign}.` });
        }
        for (const p of recentlyPaid(s, today, 3)) await act(specialist, "send_receipt", { scheduleItemId: p.scheduleItemId });
      }
      if (specialist === "MAINTENANCE") {
        for (const i of openIncidents(s).filter((x) => !x.triaged)) {
          const e = s.events.find((x) => x.id === i.eventId)!;
          await act(specialist, "triage_incident", { eventId: e.id, category: e.category, urgency: e.urgency, summary: `${e.title} : ${e.description}`.slice(0, 600) });
        }
        const pros = craftsmen(s);
        for (const i of openIncidents(s).filter((x) => x.status === "OPEN" && x.quotes.length === 0 && pros.length)) {
          await act(specialist, "request_quotes", { eventId: i.eventId, craftsmanPartyIds: pros.slice(0, 3).map((p) => p.partyId), message: `Bonjour, nous cherchons un artisan pour « ${i.title} » (${i.asset}). Pouvez-vous nous transmettre un devis et un créneau ? ${sign}.` });
        }
      }
      if (specialist === "COMPLIANCE") {
        for (const g of endingAgreements(s, today)) await act(specialist, "remind_deadline", { title: `Fin de contrat : ${g.unit}`, detail: `Le contrat se termine dans ${g.daysLeft} jours. Renouveler ou préparer la relocation.`, dueDate: g.endDate });
      }
      if (specialist === "FINANCE") {
        const prev = new Date(Date.parse(`${today.slice(0, 7)}-01`) - 86_400_000).toISOString().slice(0, 7);
        const m = monthSummary(s, prev);
        await act(specialist, "send_monthly_report", { month: prev, report: `Encaissé ${m.received} sur ${m.expected} attendus, ${m.late} échéance(s) en souffrance, dépenses ${m.expenses}, ${m.openIncidents} incident(s) ouvert(s).` });
      }
      if (specialist === "RELETTING") {
        for (const v of vacantUnits(s, today)) {
          const asking = Number((v.details as Record<string, unknown> | undefined)?.askingRent ?? 0);
          const currency = s.assets.find((a) => a.name === v.asset)?.currency ?? s.currency;
          if (asking > 0) await act(specialist, "publish_listing", { unitId: v.unitId, title: `${v.unit} à louer, ${v.asset}`, text: `${v.unit} disponible dans ${v.asset}. Loyer ${formatMoney({ amount: asking, currency })}. Contact via Keyo.`, askingRent: asking });
        }
      }
    }
    const count = (k: string) => outcomes.filter((o) => o.status === k).length;
    const parts = [
      count("DONE") && `${count("DONE")} action(s) faite(s)`,
      count("PENDING_APPROVAL") && `${count("PENDING_APPROVAL")} en attente de votre accord`,
      count("DEFERRED") && `${count("DEFERRED")} différée(s) aux heures ouvrables`,
      count("BLOCKED") && `${count("BLOCKED")} bloquée(s) par vos réglages`,
    ].filter(Boolean);
    return parts.length ? `${parts.join(", ")}.` : "Rien de nouveau : tout avait déjà été traité.";
  }
}
