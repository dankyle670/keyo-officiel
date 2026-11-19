import { z } from "zod";
import { actionDef, formatMoney, type AutonomousAction, type Channel, type Money } from "@keyo/shared";
import type { SendRequest } from "./connectors.ts";
import type { OwnerSnapshot } from "./store.ts";
import { dueContext, remaining, vacantUnits } from "./views.ts";

/**
 * Entrées des actions autonomes et leur préparation. La préparation vérifie l'action contre les
 * données réelles et en déduit ce que le modèle ne doit jamais fournir lui-même : le destinataire
 * (toujours tiré de la fiche), le montant de la dépense, la clé d'idempotence.
 */
const text = (max = 1000) => z.string().trim().min(1).max(max);
const id = z.string().min(1);
const minor = z.number().int().positive();

export const ACTION_INPUTS = {
  send_rent_reminder: z.object({ scheduleItemId: id, message: text().describe("Message à l'occupant, courtois, avec le montant et la date") }),
  send_payment_link: z.object({ scheduleItemId: id, message: text().describe("Phrase d'accompagnement ; le lien est ajouté automatiquement") }),
  send_receipt: z.object({ scheduleItemId: id }),
  propose_payment_plan: z.object({
    scheduleItemId: id,
    installments: z.array(z.object({ dueDate: z.iso.date(), amount: minor })).min(2).max(6),
    message: text(),
  }),
  send_formal_notice: z.object({ scheduleItemId: id, letter: text(4000) }),
  publish_listing: z.object({ unitId: id, title: text(120), text: text(3000), askingRent: minor.describe("Loyer demandé, unité mineure") }),
  reply_to_candidate: z.object({ phone: z.string().regex(/^\+\d{8,15}$/), name: text(80), message: text() }),
  schedule_visit: z.object({ unitId: id, phone: z.string().regex(/^\+\d{8,15}$/), name: text(80), at: z.iso.datetime({ offset: true }) }),
  triage_incident: z.object({
    eventId: id,
    category: text(60),
    urgency: z.enum(["LOW", "MEDIUM", "HIGH"]),
    summary: text(600).describe("Qualification de l'incident pour le propriétaire"),
  }),
  request_quotes: z.object({ eventId: id, craftsmanPartyIds: z.array(id).min(1).max(5), message: text() }),
  approve_quote: z.object({ eventId: id, quoteId: id }),
  schedule_intervention: z.object({ eventId: id, at: z.iso.datetime({ offset: true }), message: text() }),
  request_missing_document: z.object({ partyId: id, documentLabel: text(120), message: text() }),
  remind_deadline: z.object({ title: text(120), detail: text(600), dueDate: z.iso.date() }),
  send_monthly_report: z.object({ month: z.string().regex(/^\d{4}-\d{2}$/), report: text(4000) }),
  suggest_reappraisal: z.object({ assetId: id, reason: text(400) }),
} satisfies Record<AutonomousAction, z.ZodObject>;

export type Prepared = {
  summary: string;
  assetId?: string;
  spend?: Money;
  dedupeKey?: string;
  /** Fenêtre d'idempotence, en jours (absente = pour toujours). */
  dedupeDays?: number;
  sends: SendRequest[];
  mutations: { type: string; payload: Record<string, unknown> }[];
};
export type PrepareResult = { ok: true; value: Prepared } | { ok: false; error: string };

/** Date lisible pour les messages et le journal : « 13 novembre 2026 ». */
export const frDate = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const URGENCY = { LOW: "peu urgent", MEDIUM: "urgence moyenne", HIGH: "urgence haute" } as const;

const fail = (error: string): PrepareResult => ({ ok: false, error });
const ok = (value: Omit<Prepared, "sends" | "mutations"> & Partial<Pick<Prepared, "sends" | "mutations">>): PrepareResult => ({ ok: true, value: { sends: [], mutations: [], ...value } });
const name = (p: { firstName: string; lastName: string }) => `${p.firstName} ${p.lastName}`.trim();
const channelOf = (a: AutonomousAction): Channel => actionDef(a).channels.find((c) => c !== "PAYMENT_LINK") ?? "APP";

/** Lien de paiement de l'agrégateur ; adresse de démonstration tant que l'agrégateur n'est pas branché. */
export const paymentLink = (scheduleItemId: string) => `https://pay.keyo.app/e/${encodeURIComponent(scheduleItemId)}`;

export function prepare(action: AutonomousAction, raw: unknown, s: OwnerSnapshot, today: string): PrepareResult {
  const parsed = ACTION_INPUTS[action].safeParse(raw);
  if (!parsed.success) return fail(`Entrée invalide : ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join(" ; ")}`);
  const input = parsed.data as Record<string, any>;
  const ch = channelOf(action);

  const due = (needPaid: boolean) => {
    const c = dueContext(s, input.scheduleItemId);
    if (!c.item || !c.party || !c.asset) return { error: "Échéance introuvable." } as const;
    const late = c.item.status === "LATE" || c.item.status === "PARTIAL" || c.item.status === "UNPAID";
    if (needPaid && c.item.status !== "PAID") return { error: "Cette échéance n'est pas payée : pas de quittance." } as const;
    if (!needPaid && !late) return { error: "Cette échéance n'est pas en retard." } as const;
    return { ...c, item: c.item, party: c.party, asset: c.asset, left: remaining(c.item.expected, c.item.received) };
  };
  const send = (to: { phone: string; firstName: string; lastName: string }, body: string, channel = ch): SendRequest => ({ channel, to: to.phone, toName: name(to), text: body });

  switch (action) {
    case "send_rent_reminder": {
      const c = due(false);
      if ("error" in c) return fail(c.error!);
      return ok({ summary: `Relance de ${name(c.party)} pour ${formatMoney(c.left)} (échéance du ${frDate(c.item.dueDate)})`, assetId: c.asset.id, dedupeKey: `reminder:${c.item.id}`, dedupeDays: 3, sends: [send(c.party, input.message)] });
    }
    case "send_payment_link": {
      const c = due(false);
      if ("error" in c) return fail(c.error!);
      return ok({ summary: `Lien de paiement envoyé à ${name(c.party)} (${formatMoney(c.left)})`, assetId: c.asset.id, dedupeKey: `paylink:${c.item.id}`, dedupeDays: 3, sends: [send(c.party, `${input.message}\n${paymentLink(c.item.id)}`)] });
    }
    case "send_receipt": {
      const c = due(true);
      if ("error" in c) return fail(c.error!);
      const body = `Bonjour ${c.party.firstName}, votre paiement de ${formatMoney(c.item.received)} pour l'échéance du ${frDate(c.item.dueDate)} (${c.unit?.label ?? c.asset.name}) est bien reçu. Votre quittance est disponible dans l'application Keyo.`;
      return ok({ summary: `Quittance envoyée à ${name(c.party)} (${frDate(c.item.dueDate)})`, assetId: c.asset.id, dedupeKey: `receipt:${c.item.id}`, sends: [send(c.party, body)], mutations: [{ type: "receipt.issue", payload: { scheduleItemId: c.item.id } }] });
    }
    case "propose_payment_plan": {
      const c = due(false);
      if ("error" in c) return fail(c.error!);
      const total = (input.installments as { amount: number }[]).reduce((n, x) => n + x.amount, 0);
      if (total !== c.left.amount) return fail(`Les versements (${formatMoney({ amount: total, currency: c.left.currency })}) doivent couvrir exactement le reste dû (${formatMoney(c.left)}).`);
      return ok({ summary: `Échéancier en ${input.installments.length} versements proposé à ${name(c.party)}`, assetId: c.asset.id, dedupeKey: `plan:${c.item.id}`, dedupeDays: 14, sends: [send(c.party, input.message)] });
    }
    case "send_formal_notice": {
      const c = due(false);
      if ("error" in c) return fail(c.error!);
      return ok({ summary: `Mise en demeure adressée à ${name(c.party)} (${formatMoney(c.left)})`, assetId: c.asset.id, dedupeKey: `notice:${c.item.id}`, dedupeDays: 30, sends: [send(c.party, input.letter)] });
    }
    case "publish_listing": {
      const v = vacantUnits(s, today).find((u) => u.unitId === input.unitId);
      if (!v) return fail("Ce logement n'est pas vacant.");
      const unit = s.units.find((u) => u.id === input.unitId)!;
      const asking = { amount: input.askingRent, currency: s.assets.find((a) => a.id === unit.assetId)?.currency ?? s.currency };
      return ok({ summary: `Annonce publiée : ${input.title} (${formatMoney(asking)})`, assetId: unit.assetId, dedupeKey: `listing:${unit.id}`, dedupeDays: 30, sends: [{ channel: "LISTINGS", to: "annonces", text: `${input.title}\n${input.text}\n${formatMoney(asking)}` }] });
    }
    case "reply_to_candidate":
      return ok({ summary: `Réponse au candidat ${input.name}`, sends: [{ channel: ch, to: input.phone, toName: input.name, text: input.message }] });
    case "schedule_visit": {
      const unit = s.units.find((u) => u.id === input.unitId);
      if (!unit || !vacantUnits(s, today).some((u) => u.unitId === unit.id)) return fail("Ce logement n'est pas vacant.");
      return ok({
        summary: `Visite de ${unit.label} avec ${input.name} le ${input.at.slice(0, 16).replace("T", " à ")}`,
        assetId: unit.assetId,
        dedupeKey: `visit:${unit.id}:${input.phone}`,
        dedupeDays: 7,
        sends: [{ channel: "WHATSAPP", to: input.phone, toName: input.name, text: `Bonjour ${input.name}, votre visite de ${unit.label} est prévue le ${frDate(input.at)} à ${input.at.slice(11, 16)}.` }],
        mutations: [{ type: "mission.create", payload: { kind: "VISIT", assetId: unit.assetId, unitId: unit.id, dueDate: input.at.slice(0, 10), label: `Visite avec ${input.name}` } }],
      });
    }
    case "triage_incident": {
      const e = s.events.find((x) => x.id === input.eventId);
      if (!e) return fail("Incident introuvable.");
      return ok({ summary: `Incident qualifié : ${e.title} (${URGENCY[input.urgency as keyof typeof URGENCY]})`, assetId: e.assetId, dedupeKey: `triage:${e.id}`, mutations: [{ type: "event.update", payload: { eventId: e.id, category: input.category, urgency: input.urgency, aiSummary: input.summary } }] });
    }
    case "request_quotes": {
      const e = s.events.find((x) => x.id === input.eventId);
      if (!e || e.status === "RESOLVED") return fail("Incident introuvable ou déjà résolu.");
      const targets = (input.craftsmanPartyIds as string[]).map((pid) => s.parties.find((p) => p.id === pid && p.role === "CRAFTSMAN"));
      if (targets.some((t) => !t)) return fail("Seuls les artisans enregistrés peuvent être sollicités.");
      return ok({
        summary: `Devis demandés à ${targets.map((t) => name(t!)).join(", ")} pour « ${e.title} »`,
        assetId: e.assetId,
        dedupeKey: `quotes:${e.id}`,
        dedupeDays: 5,
        sends: targets.map((t) => send(t!, input.message)),
        mutations: [{ type: "event.update", payload: { eventId: e.id, status: "QUOTES_PENDING" } }],
      });
    }
    case "approve_quote": {
      const e = s.events.find((x) => x.id === input.eventId);
      const q = e?.quotes.find((x) => x.id === input.quoteId);
      if (!e || !q) return fail("Devis introuvable.");
      const craftsman = s.parties.find((p) => p.role === "CRAFTSMAN" && name(p).toLowerCase() === q.provider.toLowerCase());
      return ok({
        summary: `Devis de ${q.provider} accepté (${formatMoney(q.amount)}) pour « ${e.title} »`,
        assetId: e.assetId,
        spend: q.amount,
        dedupeKey: `approve:${e.id}`,
        sends: craftsman ? [send(craftsman, `Bonjour, votre devis de ${formatMoney(q.amount)} pour « ${e.title} » est accepté. Intervention le ${frDate(q.slot)} à ${q.slot.slice(11, 16)}.`)] : [],
        mutations: [{ type: "event.update", payload: { eventId: e.id, status: "SCHEDULED", scheduledAt: q.slot, acceptedQuoteId: q.id } }],
      });
    }
    case "schedule_intervention": {
      const e = s.events.find((x) => x.id === input.eventId);
      if (!e || e.status === "RESOLVED") return fail("Incident introuvable ou déjà résolu.");
      const g = s.agreements.find((x) => x.unitId === e.unitId && (!x.endDate || x.endDate >= today));
      const occupant = g && s.parties.find((p) => p.id === g.partyId);
      return ok({
        summary: `Intervention planifiée le ${frDate(input.at)} pour « ${e.title} »`,
        assetId: e.assetId,
        dedupeKey: `intervention:${e.id}:${input.at}`,
        sends: occupant ? [send(occupant, input.message)] : [],
        mutations: [{ type: "event.update", payload: { eventId: e.id, status: "SCHEDULED", scheduledAt: input.at } }],
      });
    }
    case "request_missing_document": {
      const p = s.parties.find((x) => x.id === input.partyId);
      if (!p) return fail("Personne introuvable.");
      return ok({ summary: `${input.documentLabel} demandé à ${name(p)}`, dedupeKey: `doc:${p.id}:${input.documentLabel.toLowerCase()}`, dedupeDays: 7, sends: [send(p, input.message)] });
    }
    case "remind_deadline":
      return ok({ summary: `Rappel : ${input.title} (${frDate(input.dueDate)})`, dedupeKey: `deadline:${input.title.toLowerCase()}:${input.dueDate}`, mutations: [{ type: "notification", payload: { title: input.title, body: input.detail } }] });
    case "send_monthly_report":
      return ok({ summary: `Rapport de ${input.month} envoyé`, dedupeKey: `report:${input.month}`, mutations: [{ type: "notification", payload: { title: `Rapport de ${input.month}`, body: input.report } }] });
    case "suggest_reappraisal": {
      const a = s.assets.find((x) => x.id === input.assetId);
      if (!a) return fail("Bien introuvable.");
      return ok({ summary: `Nouvelle expertise suggérée pour ${a.name}`, assetId: a.id, dedupeKey: `reappraisal:${a.id}`, dedupeDays: 180, mutations: [{ type: "notification", payload: { title: `Refaire l'expertise de ${a.name}`, body: input.reason, link: `/bien/${a.id}/evaluation` } }] });
    }
  }
}
