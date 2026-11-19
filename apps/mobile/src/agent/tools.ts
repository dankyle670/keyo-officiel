import { AGENT_TOOLS, appraisalKind, appraisalQuestions, appraise, AUDIT_AREA_LABEL, CONFIDENCE_LABEL, formatMoney, formatShare, isAgentTool, kindLabel, money, profileOf, valueAsset, type AgentToolInput, type AgentToolName, type Currency } from "@keyo/shared";
import { currentMonth, monthName, nowIso, today } from "@/data/period";
import { assetHolders, assetSummary, auditReport, familyAssets, familyHolders, formatPermille, isOpenEvent, latestAppraisal, monthSummary, partyName, portfolioValue, yearFinance } from "@/data/selectors";
import { getSession, getSettings } from "@/data/session";
import { actions, getOwnerState } from "@/data/store";
import { agentMode, postOps, type TurnContext } from "./api";
import { getAttachment } from "./conversation";

/**
 * Exécution des outils de l'agent sur les données du téléphone. Chaque entrée est validée avec le
 * schéma partagé avant exécution : une entrée invalide renvoie une erreur à l'agent, qui corrige.
 */
export type ToolOutcome = { ok: true; result: unknown; summary: string } | { ok: false; error: string };

const currency = (): Currency => {
  const s = getSession();
  return s.status === "signedIn" ? s.user.displayCurrency : "XOF";
};
export const turnContext = (): TurnContext => {
  const s = getSession();
  const user = s.status === "signedIn" ? s.user : undefined;
  return { today: today(), currency: currency(), ownerName: user?.firstName };
};

const owner = () => {
  const s = getSession();
  return s.status === "signedIn" ? { id: s.user.id, name: `${s.user.firstName} ${s.user.lastName ?? ""}`.trim() } : { id: "owner", name: "Vous" };
};
const DOC_KIND: Record<string, string> = { LEASE: "bail", INVENTORY: "état des lieux", TITLE_DEED: "titre de propriété", RECEIPT: "quittance", INVOICE: "facture", INSURANCE: "assurance", TAX_FILING: "document fiscal", REGISTRATION: "enregistrement", PHOTO: "photo", REPORT: "rapport", APPRAISAL: "rapport d'expertise" };

const assetName = (id: string) => getOwnerState().assets.find((a) => a.id === id)?.name;
const fmt = (amount: number, c: Currency) => formatMoney(money(amount, c));

type Executor<N extends AgentToolName> = (input: AgentToolInput<N>) => Promise<ToolOutcome> | ToolOutcome;
const ok = (result: unknown, summary: string): ToolOutcome => ({ ok: true, result, summary });
const fail = (error: string): ToolOutcome => ({ ok: false, error });

const EXECUTORS: { [N in AgentToolName]: Executor<N> } = {
  get_portfolio() {
    const s = getOwnerState();
    const on = today();
    const assets = s.assets.map((a) => {
      const sum = assetSummary(s, a, on);
      return {
        assetId: a.id,
        name: a.name,
        type: profileOf(a.type).label,
        kind: kindLabel(a.type, a.details.kind),
        vocabulary: { unit: profileOf(a.type).unit.one, occupant: profileOf(a.type).occupant.one, amount: profileOf(a.type).amount },
        address: `${a.location.address}, ${a.location.city} (${a.location.country})`,
        currency: a.currency,
        monthlyRent: formatMoney(sum.monthlyRent),
        grossYield: sum.grossYieldPermille ? formatPermille(sum.grossYieldPermille) : undefined,
        units: sum.units.map((u) => {
          const lease = sum.leases.find((g) => g.unitId === u.id);
          return {
            unitId: u.id,
            label: u.label,
            occupied: !!lease,
            agreementId: lease?.id,
            occupantPartyId: lease?.partyId,
            occupant: lease ? partyName(s, lease.partyId) : undefined,
            rent: lease ? formatMoney(lease.periodicAmount) : undefined,
            dueDay: lease?.dueDay,
            startDate: lease?.startDate,
            endDate: lease?.endDate,
          };
        }),
      };
    });
    const managers = s.parties.filter((p) => p.role === "FIELD_MANAGER").map((p) => ({ partyId: p.id, name: `${p.firstName} ${p.lastName}`, phone: p.phone }));
    return ok({ assets, fieldManagers: managers }, `${assets.length} bien${assets.length > 1 ? "s" : ""}`);
  },

  get_rents({ month }) {
    const m = month ?? currentMonth();
    const sum = monthSummary(getOwnerState(), m, today(), currency());
    const lines = sum.lines.map((l) => ({
      agreementId: l.agreementId,
      occupant: l.partyName,
      asset: l.assetName,
      dueDate: l.dueDate,
      expected: formatMoney(l.expected),
      received: formatMoney(l.received),
      status: l.status,
      daysLate: l.daysLate || undefined,
    }));
    return ok({ month: m, lines }, `${lines.length} échéances en ${monthName(m)}`);
  },

  get_finances({ assetId, year }) {
    const s = getOwnerState();
    const y = year ?? Number(today().slice(0, 4));
    const c = currency();
    const ids = assetId ? [assetId] : s.assets.map((a) => a.id);
    if (assetId && !assetName(assetId)) return fail(`Bien introuvable : ${assetId}`);
    const per = ids.map((id) => ({ id, f: yearFinance(s, id, y, c) }));
    const total = (k: "income" | "expenses" | "net") => per.reduce((acc, p) => acc + p.f[k].amount, 0);
    const byMonth = Array.from({ length: 12 }, (_, i) => per.reduce((acc, p) => acc + p.f.byMonth[i]!, 0));
    return ok(
      {
        year: y,
        currency: c,
        scope: assetId ? assetName(assetId) : "Tout le patrimoine",
        income: fmt(total("income"), c),
        expenses: fmt(total("expenses"), c),
        net: fmt(total("net"), c),
        netByMonthMinor: byMonth,
        perAsset: per.map((p) => ({ asset: assetName(p.id), net: formatMoney(p.f.net), expenses: formatMoney(p.f.expenses) })),
        expenseLines: per.flatMap((p) => p.f.transactions.filter((t) => t.direction === "OUT").map((t) => ({ asset: assetName(p.id), label: t.label, amount: formatMoney(t.amount), date: t.occurredAt.slice(0, 10) }))),
      },
      `Finances ${y}`,
    );
  },

  get_monthly_report({ month }) {
    const s = getOwnerState();
    const m = month ?? currentMonth();
    const c = currency();
    const sum = monthSummary(s, m, today(), c);
    const out = s.transactions.filter((t) => t.direction === "OUT" && t.occurredAt.startsWith(m) && t.amount.currency === c);
    return ok(
      {
        month: m,
        collected: fmt(sum.lines.reduce((a, l) => a + l.received.amount, 0), c),
        expected: fmt(sum.lines.reduce((a, l) => a + l.expected.amount, 0), c),
        late: sum.late.map((l) => ({ occupant: l.partyName, asset: l.assetName, daysLate: l.daysLate, amount: formatMoney(l.expected) })),
        expenses: out.map((t) => ({ label: t.label, amount: formatMoney(t.amount), asset: assetName(t.assetId) })),
        openIncidents: s.events.filter(isOpenEvent).map((e) => ({ title: e.title, asset: assetName(e.assetId), status: e.status })),
        upcomingMaintenance: s.maintenance.filter((x) => x.nextDueOn.slice(0, 7) <= m).map((x) => ({ label: x.label, asset: assetName(x.assetId), due: x.nextDueOn })),
        missions: s.missions.filter((x) => x.dueDate.startsWith(m)).map((x) => ({ title: x.title, status: x.status, report: x.report })),
      },
      `Rapport de ${monthName(m)}`,
    );
  },

  get_incidents({ status }) {
    const s = getOwnerState();
    const list = s.events.filter((e) => status === "ALL" || isOpenEvent(e));
    return ok(
      list.map((e) => ({
        eventId: e.id,
        title: e.title,
        asset: assetName(e.assetId),
        assetId: e.assetId,
        urgency: e.urgency,
        status: e.status,
        reportedAt: e.reportedAt.slice(0, 10),
        quotes: e.quotes.map((q) => ({ quoteId: q.id, provider: q.provider, rating: q.rating, amount: formatMoney(q.amount), slot: q.slot })),
      })),
      `${list.length} incident${list.length > 1 ? "s" : ""}`,
    );
  },

  get_documents({ assetId }) {
    const docs = getOwnerState().documents.filter((d) => !assetId || d.assetId === assetId);
    return ok(docs.map((d) => ({ kind: d.kind, label: d.label, asset: assetName(d.assetId), year: d.year, date: d.createdAt.slice(0, 10) })), `${docs.length} documents`);
  },

  get_valuation({ assetId }) {
    const s = getOwnerState();
    const all = assetId ? s.assets.filter((a) => a.id === assetId) : s.assets;
    if (assetId && !all.length) return fail(`Bien introuvable : ${assetId}`);
    const list = all.filter((a) => appraisalKind(a));
    const unsupported = all.filter((a) => !appraisalKind(a)).map((a) => a.name);
    const out = list.map((a) => {
      const last = latestAppraisal(s, a.id);
      const v = valueAsset({ asset: a, units: s.units, agreements: s.agreements, documents: s.documents, today: today() });
      const f = (x: { amount: number } | null) => (x ? fmt(x.amount, a.currency) : null);
      return {
        assetId: a.id,
        name: a.name,
        type: profileOf(a.type).label,
        kind: kindLabel(a.type, a.details.kind),
        city: a.location.city,
        country: a.location.country,
        derniereExpertise: last ? { date: last.createdAt.slice(0, 10), valeur: formatMoney(last.result.value), fourchette: `${formatMoney(last.result.low)} à ${formatMoney(last.result.high)}`, retenue: last.applied, facteurs: last.result.factors } : null,
        valeurSaisie: f(v.declared),
        estimation: f(v.suggested),
        fourchette: v.low && v.high ? `${f(v.low)} à ${f(v.high)}` : null,
        parRevenu: f(v.incomeValue),
        parPrixAchat: f(v.costValue),
        rendementReference: `${v.yieldPermille / 10} %`,
        methode: v.method,
        fiabilite: CONFIDENCE_LABEL[v.confidence],
        unites: v.units.map((u) => ({ unitId: u.unitId, label: u.label, mensuel: f(u.monthly), source: u.source, valeur: f(u.value), saisie: f(u.declared), details: s.units.find((x) => x.id === u.unitId)?.details })),
        documents: s.documents.filter((d) => d.assetId === a.id).map((d) => `${DOC_KIND[d.kind] ?? d.kind} : ${d.label}`),
        manque: v.missing,
        valeursMineures: { estimation: v.suggested?.amount ?? null, unites: Object.fromEntries(v.units.map((u) => [u.unitId, u.value?.amount ?? null])) },
      };
    });
    return ok({ biens: out, nonPrisEnCharge: unsupported.length ? `${unsupported.join(", ")} : évaluation pas encore disponible pour ce type (maisons, appartements et plantations seulement).` : undefined, conseil: "Pour une vraie estimation, proposez l'entretien d'expert (get_appraisal_questions).", avertissement: "Estimation indicative, à confirmer par un expert ou un notaire." }, `${out.length} bien${out.length > 1 ? "s" : ""} évalué${out.length > 1 ? "s" : ""}`);
  },

  get_appraisal_questions({ assetId }) {
    const s = getOwnerState();
    const a = s.assets.find((x) => x.id === assetId);
    if (!a) return fail(`Bien introuvable : ${assetId}`);
    if (!appraisalKind(a)) return fail("L'expertise n'est disponible que pour les maisons, les appartements et les plantations.");
    const questions = appraisalQuestions(a, s.units);
    return ok({ bien: a.name, questions }, `${questions.length} questions`);
  },

  submit_appraisal({ assetId, answers, apply }) {
    const s = getOwnerState();
    const a = s.assets.find((x) => x.id === assetId);
    if (!a) return fail(`Bien introuvable : ${assetId}`);
    const r = appraise({ asset: a, units: s.units, agreements: s.agreements, documents: s.documents, today: today(), answers });
    if (!r) return fail("L'expertise n'est disponible que pour les maisons, les appartements et les plantations.");
    if (r.missing.length) return fail(`Réponses manquantes : ${r.missing.join(", ")}. Posez ces questions avant de conclure.`);
    actions.saveAppraisal(a.id, answers, r, "AGENT", apply);
    return ok(
      { valeur: formatMoney(r.value), fourchette: `${formatMoney(r.low)} à ${formatMoney(r.high)}`, fiabilite: CONFIDENCE_LABEL[r.confidence], facteurs: r.factors, methode: r.method, ecartAvecAvisProprietaire: r.ownerGapPercent, retenue: apply },
      `Expertise de ${a.name} : ${formatMoney(r.value)}`,
    );
  },

  get_patrimony() {
    const s = getOwnerState();
    const o = owner();
    const holders = familyHolders(s, o).map((h) => ({
      holderId: h.id,
      nom: h.name,
      lien: h.relation,
      statut: h.status === "OWNER" ? "propriétaire" : h.status === "JOINED" ? "inscrit" : "invité, pas encore inscrit",
      acces: h.access === "MANAGE" ? "co-gestion" : h.access ? "consultation" : undefined,
      valeurDeSaPart: h.patrimony.totals.map((m) => formatMoney(m)),
      biens: h.patrimony.lines.map((l) => ({ assetId: l.assetId, bien: assetName(l.assetId), part: formatShare(l.sharePermille), valeur: l.part ? formatMoney(l.part) : "non estimée" })),
    }));
    const famille = familyAssets(s).map((a) => ({ assetId: a.id, bien: a.name, parts: assetHolders(s, a.id, o).map((h) => `${h.name} ${formatShare(h.sharePermille)}`) }));
    return ok({ ownerId: o.id, valeurTotale: portfolioValue(s).map((m) => formatMoney(m)), detenteurs: holders, biensDeFamille: famille }, `${holders.length} détenteur${holders.length > 1 ? "s" : ""}`);
  },

  set_asset_value({ assetId, value, unitValues }) {
    const s = getOwnerState();
    if (!s.assets.some((a) => a.id === assetId)) return fail(`Bien introuvable : ${assetId}`);
    actions.updateAsset(assetId, { value });
    for (const u of unitValues ?? []) if (s.units.some((x) => x.id === u.unitId && x.assetId === assetId)) actions.updateUnit(u.unitId, { details: { value: u.value } });
    return ok({ done: true }, `Valeur de ${assetName(assetId)} enregistrée`);
  },

  invite_family_member(input) {
    const id = actions.inviteFamilyMember({ firstName: input.firstName, lastName: input.lastName, phone: input.phone, relation: input.relation, access: input.access });
    return ok({ partyId: id, note: "Le propriétaire doit encore envoyer le lien d'invitation depuis Famille et patrimoine." }, `${input.firstName} ajouté à la famille`);
  },

  set_family_shares({ assetId, shares }) {
    const s = getOwnerState();
    const a = s.assets.find((x) => x.id === assetId);
    if (!a) return fail(`Bien introuvable : ${assetId}`);
    const total = shares.reduce((n, x) => n + x.sharePermille, 0);
    if (total !== 1000) return fail(`Les parts font ${formatShare(total)} au lieu de 100 %.`);
    const known = new Set([a.ownerId, ...s.parties.filter((p) => p.role === "FAMILY").map((p) => p.id)]);
    const unknown = shares.find((x) => !known.has(x.holderId));
    if (unknown) return fail(`Détenteur inconnu : ${unknown.holderId}. Invitez d'abord ce proche.`);
    actions.setHolding(assetId, "FAMILY", shares);
    return ok({ done: true }, `Parts de ${a.name} enregistrées`);
  },

  async run_compliance_check() {
    const report = auditReport(getOwnerState(), today());
    // Sous-agent « ops » côté serveur : il priorise, sans inventer de point. Facultatif.
    let review: Awaited<ReturnType<typeof postOps>> | undefined;
    if ((await agentMode()).mode === "claude") review = await postOps(report.findings, report.score, turnContext()).catch(() => undefined);
    return ok(
      {
        score: report.score,
        counts: report.counts,
        findings: report.findings.map((f) => ({ id: f.id, severity: f.severity, area: AUDIT_AREA_LABEL[f.area], title: f.title, detail: f.detail })),
        opsReview: review,
      },
      `Score ${report.score}/100, ${report.findings.length} point${report.findings.length > 1 ? "s" : ""}`,
    );
  },

  file_document({ attachmentId, assetId, kind, label, agreementId, year }) {
    const file = getAttachment(attachmentId);
    if (!file) return fail(`Pièce jointe introuvable : ${attachmentId}`);
    if (!assetName(assetId)) return fail(`Bien introuvable : ${assetId}`);
    actions.addDocument({ assetId, kind, label, url: file.uri, agreementId, year });
    return ok({ done: true }, `« ${label} » classé dans ${assetName(assetId)}`);
  },

  add_expense({ assetId, label, category, amount, currency: c, date }) {
    if (!assetName(assetId)) return fail(`Bien introuvable : ${assetId}`);
    actions.addExpense({ assetId, label, category, amount: money(amount, c), date: date ?? today() });
    return ok({ done: true }, `Dépense de ${fmt(amount, c)} ajoutée`);
  },

  create_asset(input) {
    const id = `a-${Date.now().toString(36)}`;
    actions.addAsset({
      asset: {
        id,
        ownerId: getSession().status === "signedIn" ? (getSession() as { user: { id: string } }).user.id : "owner",
        type: input.type,
        name: input.name,
        location: { address: input.address, city: input.city, country: input.country.toUpperCase(), lat: 5.35, lng: -3.98 },
        details: { kind: input.kind },
        currency: input.currency,
        createdAt: nowIso(),
      },
      units: input.units.map((u, i) => {
        const key = profileOf(input.type).measure?.key;
        return { id: `${id}-u${i + 1}`, assetId: id, type: input.type, label: u.label, details: { ...(key && u.measure ? { [key]: u.measure } : {}), askingRent: u.askingRent } };
      }),
      photos: [],
    });
    return ok({ assetId: id, unitIds: input.units.map((_, i) => `${id}-u${i + 1}`) }, `${input.name} créé`);
  },

  invite_occupant(input) {
    const s = getOwnerState();
    const unit = s.units.find((u) => u.id === input.unitId && u.assetId === input.assetId);
    if (!unit) return fail("Logement introuvable pour ce bien.");
    if (s.agreements.some((g) => g.unitId === unit.id && g.kind === "LEASE" && (!g.endDate || g.endDate >= today()))) return fail("Ce logement a déjà un contrat en cours.");
    const r = actions.createLease({
      assetId: input.assetId,
      unitId: input.unitId,
      tenant: { firstName: input.firstName, lastName: input.lastName, phone: input.phone },
      startDate: input.startDate,
      rent: money(input.rent, input.currency),
      deposit: money(input.deposit, input.currency),
      dueDay: input.dueDay,
    });
    return ok(r, `${input.firstName} invité`);
  },

  update_lease({ agreementId, amount, deposit, dueDay, endDate }) {
    const g = getOwnerState().agreements.find((a) => a.id === agreementId);
    if (!g) return fail(`Contrat introuvable : ${agreementId}`);
    actions.updateLease(agreementId, { amount, deposit, dueDay, endDate });
    return ok({ done: true }, "Contrat modifié");
  },

  update_unit({ unitId, label, askingRent, measure }) {
    const s = getOwnerState();
    const u = s.units.find((x) => x.id === unitId);
    if (!u) return fail(`Unité introuvable : ${unitId}`);
    const key = profileOf(s.assets.find((a) => a.id === u.assetId)?.type ?? "REAL_ESTATE").measure?.key;
    actions.updateUnit(unitId, { label, details: { ...(askingRent !== undefined ? { askingRent } : {}), ...(key && measure ? { [key]: measure } : {}) } });
    return ok({ done: true }, `${label ?? u.label} modifié`);
  },

  send_reminder({ agreementId, tone }) {
    const s = getOwnerState();
    const g = s.agreements.find((a) => a.id === agreementId);
    if (!g) return fail(`Contrat introuvable : ${agreementId}`);
    const p = s.parties.find((x) => x.id === g.partyId);
    const late = monthSummary(s, currentMonth(), today(), g.periodicAmount.currency).late.find((l) => l.agreementId === agreementId);
    const amount = formatMoney(late?.expected ?? g.periodicAmount);
    const text = {
      COURTEOUS: `Bonjour ${p?.firstName ?? ""}, petit rappel : le loyer de ${amount} n'a pas encore été reçu. Vous pouvez le régler depuis Keyo. Merci.`,
      FIRM: `Bonjour ${p?.firstName ?? ""}, le loyer de ${amount} est en retard. Merci de le régler rapidement depuis Keyo ou de me contacter.`,
      FINAL: `Bonjour ${p?.firstName ?? ""}, dernier rappel avant mesures : le loyer de ${amount} reste impayé. Merci de régulariser sous 48 heures.`,
    }[tone];
    actions.sendMessage(g.partyId, text);
    return ok({ sent: true, text, channels: getSettings().reminderChannels }, `Relance envoyée à ${p?.firstName ?? "l'occupant"}`);
  },

  send_message({ partyId, text }) {
    if (!getOwnerState().parties.some((p) => p.id === partyId)) return fail(`Interlocuteur introuvable : ${partyId}`);
    actions.sendMessage(partyId, text);
    return ok({ sent: true }, `Message envoyé à ${partyName(getOwnerState(), partyId)}`);
  },

  request_quotes(input) {
    if (!assetName(input.assetId)) return fail(`Bien introuvable : ${input.assetId}`);
    const eventId = actions.requestQuotes(input);
    const e = getOwnerState().events.find((x) => x.id === eventId)!;
    return ok(
      { eventId, quotes: e.quotes.map((q) => ({ quoteId: q.id, provider: q.provider, rating: q.rating, amount: formatMoney(q.amount), slot: q.slot })) },
      `${e.quotes.length} devis reçus`,
    );
  },

  approve_quote({ eventId, quoteId }) {
    const e = getOwnerState().events.find((x) => x.id === eventId);
    const q = e?.quotes.find((x) => x.id === quoteId);
    if (!e || !q) return fail("Devis introuvable.");
    actions.approveQuote(eventId, quoteId);
    return ok({ scheduledAt: q.slot }, `${q.provider.split(",")[0]} confirmé`);
  },

  resolve_incident({ eventId }) {
    if (!getOwnerState().events.some((e) => e.id === eventId)) return fail("Incident introuvable.");
    actions.resolveEvent(eventId);
    return ok({ done: true }, "Incident clôturé");
  },

  schedule_maintenance(input) {
    if (!assetName(input.assetId)) return fail(`Bien introuvable : ${input.assetId}`);
    const id = actions.addMaintenance(input);
    return ok({ maintenanceId: id }, `Entretien programmé le ${input.nextDueOn}`);
  },

  assign_mission(input) {
    if (!assetName(input.assetId)) return fail(`Bien introuvable : ${input.assetId}`);
    const r = actions.assignMission(input);
    return ok(r, `Mission confiée pour le ${input.dueDate}`);
  },
};

export async function executeTool(name: string, rawInput: unknown): Promise<ToolOutcome> {
  if (!isAgentTool(name)) return fail(`Outil inconnu : ${name}`);
  const parsed = AGENT_TOOLS[name].input.safeParse(rawInput ?? {});
  if (!parsed.success) return fail(`Entrée invalide : ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`);
  try {
    return await (EXECUTORS[name] as Executor<AgentToolName>)(parsed.data as never);
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Erreur pendant l'action.");
  }
}

/** Phrase affichée sur la carte de confirmation : ce que l'agent s'apprête à faire, en clair. */
export function describeAction(name: string, input: Record<string, unknown>): string {
  const s = getOwnerState();
  const a = typeof input.assetId === "string" ? assetName(input.assetId) : undefined;
  const c = (input.currency as Currency) ?? currency();
  const n = (v: unknown) => (typeof v === "number" ? fmt(v, c) : "");
  switch (name) {
    case "file_document": {
      return `Classer « ${input.label} » comme ${DOC_KIND[input.kind as string] ?? "document"} dans ${a}.`;
    }
    case "add_expense":
      return `Ajouter une dépense de ${n(input.amount)} « ${input.label} » sur ${a}.`;
    case "create_asset":
      return `Créer le bien « ${input.name} » à ${input.city} avec ${(input.units as unknown[]).length} logement(s).`;
    case "invite_occupant":
      return `Créer le contrat de ${input.firstName} ${input.lastName} (${a}), loyer ${n(input.rent)}, caution ${n(input.deposit)}, à partir du ${input.startDate}, et l'inviter par SMS au ${input.phone}.`;
    case "update_lease": {
      const g = s.agreements.find((x) => x.id === input.agreementId);
      const parts = [
        typeof input.amount === "number" && `montant ${n(input.amount)}`,
        typeof input.deposit === "number" && `caution ${n(input.deposit)}`,
        input.dueDay && `échéance le ${input.dueDay}`,
        input.endDate && `fin le ${input.endDate}`,
      ].filter(Boolean);
      return `Modifier le contrat de ${g ? partyName(s, g.partyId) : "l'occupant"} : ${parts.join(", ")}.`;
    }
    case "set_asset_value": {
      const asset = s.assets.find((x) => x.id === input.assetId);
      const cur = asset?.currency ?? c;
      const units = (input.unitValues as { unitId: string; value: number }[] | undefined) ?? [];
      return `Fixer la valeur de ${a} à ${fmt(Number(input.value), cur)}${units.length ? `, dont ${units.map((u) => `${s.units.find((x) => x.id === u.unitId)?.label ?? "unité"} ${fmt(u.value, cur)}`).join(", ")}` : ""}.`;
    }
    case "submit_appraisal":
      return `Enregistrer l'expertise de ${a}${input.apply ? " et retenir sa valeur pour le patrimoine" : ""}.`;
    case "invite_family_member":
      return `Ajouter ${input.firstName} ${input.lastName} (${String(input.relation).toLowerCase()}) à la famille, en ${input.access === "MANAGE" ? "co-gestion" : "consultation"}.`;
    case "set_family_shares": {
      const o = owner();
      const list = (input.shares as { holderId: string; sharePermille: number }[]).map((x) => `${x.holderId === o.id ? "vous" : partyName(s, x.holderId)} ${formatShare(x.sharePermille)}`);
      return `Déclarer ${a} comme bien de famille : ${list.join(", ")}.`;
    }
    case "update_unit": {
      const u = s.units.find((x) => x.id === input.unitId);
      return `Modifier ${u?.label ?? "l'unité"}${input.label ? ` (nouveau nom : ${input.label})` : ""}${typeof input.askingRent === "number" ? `, montant demandé ${n(input.askingRent)}` : ""}.`;
    }
    case "send_reminder": {
      const g = s.agreements.find((x) => x.id === input.agreementId);
      const tone = { COURTEOUS: "courtoise", FIRM: "ferme", FINAL: "de dernier rappel" }[input.tone as string] ?? "";
      return `Envoyer une relance ${tone} à ${g ? partyName(s, g.partyId) : "l'occupant"}.`;
    }
    case "send_message":
      return `Envoyer à ${partyName(s, String(input.partyId))} : « ${input.text} »`;
    case "request_quotes":
      return `Demander trois devis pour « ${input.title} » à ${a}.`;
    case "approve_quote": {
      const e = s.events.find((x) => x.id === input.eventId);
      const q = e?.quotes.find((x) => x.id === input.quoteId);
      return q ? `Valider le devis de ${q.provider.split(",")[0]} pour ${formatMoney(q.amount)} (${e!.title}).` : "Valider ce devis.";
    }
    case "resolve_incident":
      return `Clôturer l'incident « ${s.events.find((e) => e.id === input.eventId)?.title ?? ""} ».`;
    case "schedule_maintenance":
      return `Programmer « ${input.label} » à ${a}, tous les ${input.everyMonths} mois, prochain passage le ${input.nextDueOn}.`;
    case "assign_mission":
      return `Confier la mission « ${input.title} » (${a}) pour le ${input.dueDate}.`;
    default:
      return AGENT_TOOLS[name as AgentToolName]?.label ?? name;
  }
}
