import { useSyncExternalStore } from "react";
import {
  addMonths,
  buildMonthlySchedule,
  dueDateFor,
  dueStatus,
  profileOf,
  type Agreement,
  type Asset,
  type AssetShare,
  type AppraisalAnswers,
  type AppraisalResult,
  type Holding,
  type AssetEvent,
  type AssetUnit,
  type Document,
  type MaintenancePlan,
  type Mission,
  type MissionKind,
  type Money,
  type Party,
  type ScheduleItem,
  type Transaction,
} from "@keyo/shared";
import { createDemoState, createEmptyState } from "./mock";
import { KEYS, load, remove, save } from "./persist";
import { addDays, currentMonth, nowIso, today } from "./period";

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const FAKE_FIRST = ["Adjoua", "Kouassi", "Aya", "Yao", "Mariétou", "Sékou", "Affoué", "Bakary", "Nadia", "Jean-Marc", "Salimata", "Hervé"];
const FAKE_LAST = ["Kouadio", "Traoré", "N'Guessan", "Coulibaly", "Bamba", "Konan", "Diabaté", "Yapi", "Ouattara", "Gnagne"];
/** Montant par défaut d'un occupant fictif, en FCFA (centimes pour l'euro, voir addFakeOccupant). */
const FAKE_AMOUNT: Record<string, number> = { REAL_ESTATE: 120_000, PLANTATION: 250_000, FARM: 150_000, VEHICLE: 180_000, SHOP: 200_000 };

/** Annuaire d'artisans fictif, en attendant le vrai réseau de prestataires notés. */
const ARTISANS = [
  { name: "Konan Services", rating: 4.8, factor: 1 },
  { name: "Atelier Bamba", rating: 4.5, factor: 0.85 },
  { name: "Abidjan Pro Dépannage", rating: 4.2, factor: 1.2 },
];
const QUOTE_BASE: Record<string, number> = { PLUMBING: 35_000, ELECTRICITY: 40_000, AIR_CONDITIONING: 45_000, PAINTING: 150_000, LOCKSMITH: 25_000, SEPTIC: 60_000, OTHER: 40_000 };
const CATEGORY_TRADE: Record<string, string> = {
  PLUMBING: "plombier",
  ELECTRICITY: "électricien",
  AIR_CONDITIONING: "frigoriste",
  PAINTING: "peintre",
  LOCKSMITH: "serrurier",
  SEPTIC: "vidange",
};

export type Message = { id: string; partyId: string; from: "OWNER" | "PARTY"; text: string; at: string };

export type Appraisal = { id: string; assetId: string; answers: AppraisalAnswers; result: AppraisalResult; createdAt: string; by: "OWNER" | "AGENT"; applied: boolean };

/** Partage du passeport avec un établissement : consentement, durée limitée, révocable. */
export type PassportShare = {
  id: string;
  institution: string;
  institutionKind: "BANK" | "MICROFINANCE" | "OTHER";
  scopes: ("SCORE" | "INCOME" | "PATRIMONY" | "ASSETS")[];
  createdAt: string;
  expiresAt: string;
  revokedAt?: string;
  /** Code de vérification remis à l'établissement. */
  code: string;
  /** Consultations par l'établissement (alimenté par l'API). */
  accesses: string[];
};
export type PassportState = { otherIncome?: number; existingLoans?: number; shares: PassportShare[] };

export type OwnerState = {
  assets: Asset[];
  units: AssetUnit[];
  parties: Party[];
  agreements: Agreement[];
  schedule: ScheduleItem[];
  transactions: Transaction[];
  events: AssetEvent[];
  documents: Document[];
  messages: Message[];
  maintenance: MaintenancePlan[];
  missions: Mission[];
  /** Parts des biens de famille. */
  shares: AssetShare[];
  /** Expertises Keyo réalisées (entretien et résultat), la plus récente en dernier. */
  appraisals: Appraisal[];
  /** Passeport propriétaire : revenus déclarés et partages. */
  passport: PassportState;
  notificationsReadAt: string;
  /** Avis des agents autonomes (rappels, rapports, actions faites), reçus du serveur. */
  agentNotices: AgentNotice[];
};

export type AgentNotice = { id: string; at: string; title: string; body: string; href?: string };

/** Modification décidée par un agent autonome côté serveur, à appliquer ici une seule fois. */
export type AgentMutation = { id: string; type: string; payload: Record<string, unknown>; createdAt: string };

/**
 * Magasin local, persisté sur le téléphone (hors ligne d'abord). Il sera branché sur l'API
 * (synchronisation + file d'attente des actions) sans changer les écrans, qui ne passent que
 * par les sélecteurs et les actions ci-dessous.
 */
let state: OwnerState = createEmptyState();
let hydrated = false;
const listeners = new Set<() => void>();

const setState = (next: (s: OwnerState) => OwnerState) => {
  state = next(state);
  if (hydrated) save(KEYS.owner, state);
  listeners.forEach((l) => l());
};

export function useOwnerState<T>(select: (s: OwnerState) => T): T {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => select(state),
  );
}

export const getOwnerState = () => state;

/** Abonnement hors React (synchronisation avec le serveur). */
export const subscribeOwnerState = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};

let seq = 0;
const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(seq++).toString(36)}`;

export type LeaseInput = {
  assetId: string;
  unitId: string;
  tenant: { firstName: string; lastName: string; phone: string };
  startDate: string;
  rent: Money;
  deposit: Money;
  dueDay: number;
};

export const actions = {
  /** Charge l'état enregistré sur le téléphone. Un compte neuf démarre vide. */
  async hydrate() {
    const saved = await load<OwnerState>(KEYS.owner);
    state = saved ? { ...createEmptyState(), ...saved } : createEmptyState();
    hydrated = true;
    listeners.forEach((l) => l());
  },

  loadDemo(ownerId: string) {
    setState(() => createDemoState(ownerId, nowIso()));
  },

  async reset() {
    await remove(KEYS.owner);
    setState(() => createEmptyState());
  },

  addAsset(input: { asset: Asset; units: AssetUnit[]; photos: string[] }) {
    const photoDocs: Document[] = input.photos.map((uri, i) => ({
      id: newId("d"),
      assetId: input.asset.id,
      kind: "PHOTO",
      label: `Photo ${i + 1}`,
      url: uri,
      createdAt: nowIso(),
    }));
    setState((s) => ({ ...s, assets: [...s.assets, input.asset], units: [...s.units, ...input.units], documents: [...s.documents, ...photoDocs] }));
  },

  /** Supprime un bien et tout ce qui s'y rattache. Côté API : archivage, pas de suppression définitive. */
  deleteAsset(assetId: string) {
    setState((s) => {
      const leases = s.agreements.filter((g) => g.assetId === assetId).map((g) => g.id);
      return {
        ...s,
        assets: s.assets.filter((a) => a.id !== assetId),
        units: s.units.filter((u) => u.assetId !== assetId),
        agreements: s.agreements.filter((g) => g.assetId !== assetId),
        schedule: s.schedule.filter((it) => !leases.includes(it.agreementId)),
        transactions: s.transactions.filter((t) => t.assetId !== assetId),
        events: s.events.filter((e) => e.assetId !== assetId),
        documents: s.documents.filter((d) => d.assetId !== assetId),
        maintenance: s.maintenance.filter((m) => m.assetId !== assetId),
        missions: s.missions.filter((m) => m.assetId !== assetId),
        shares: s.shares.filter((x) => x.assetId !== assetId),
        appraisals: s.appraisals.filter((x) => x.assetId !== assetId),
      };
    });
  },

  addUnit(assetId: string, label: string, details: Record<string, unknown>): string {
    const id = newId("u");
    const type = state.assets.find((a) => a.id === assetId)?.type ?? "REAL_ESTATE";
    setState((s) => ({ ...s, units: [...s.units, { id, assetId, type: type === "REAL_ESTATE" ? "DWELLING" : type, label, details }] }));
    return id;
  },

  /**
   * Crée le locataire, le bail et son échéancier, puis prépare l'invitation par SMS.
   * Côté API : l'invitation part par SMS avec un lien d'accès ; le locataire rejoint son logement.
   */
  createLease(input: LeaseInput): { agreementId: string; partyId: string } {
    const partyId = newId("p");
    const agreementId = newId("g");
    const party: Party = { id: partyId, role: "OCCUPANT", ...input.tenant };
    const agreement: Agreement = {
      id: agreementId,
      assetId: input.assetId,
      unitId: input.unitId,
      kind: "LEASE",
      partyId,
      startDate: input.startDate,
      periodicAmount: input.rent,
      deposit: input.deposit,
      dueDay: input.dueDay,
      period: "MONTHLY",
    };
    const items = buildMonthlySchedule(agreement, addMonths(currentMonth(), 1), today());
    const leaseDoc: Document = {
      id: newId("d"),
      assetId: input.assetId,
      kind: "LEASE",
      agreementId,
      label: `Bail de ${input.tenant.firstName} ${input.tenant.lastName}`.trim(),
      url: "",
      createdAt: nowIso(),
    };
    setState((s) => ({
      ...s,
      parties: [...s.parties, party],
      agreements: [...s.agreements, agreement],
      schedule: [...s.schedule, ...items],
      documents: [...s.documents, leaseDoc],
    }));
    return { agreementId, partyId };
  },

  setPassportDeclared(patch: { otherIncome?: number; existingLoans?: number }) {
    setState((s) => ({ ...s, passport: { ...s.passport, ...patch } }));
  },

  sharePassport(input: { institution: string; institutionKind: PassportShare["institutionKind"]; scopes: PassportShare["scopes"]; days: number }): PassportShare {
    const now = new Date();
    const share: PassportShare = {
      id: newId("ps"),
      institution: input.institution,
      institutionKind: input.institutionKind,
      scopes: input.scopes,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + input.days * 86_400_000).toISOString(),
      code: Array.from({ length: 8 }, () => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 32)]).join("").replace(/(.{4})/, "$1-"),
      accesses: [],
    };
    setState((s) => ({ ...s, passport: { ...s.passport, shares: [...s.passport.shares, share] } }));
    return share;
  },

  revokePassportShare(id: string) {
    setState((s) => ({ ...s, passport: { ...s.passport, shares: s.passport.shares.map((x) => (x.id === id ? { ...x, revokedAt: nowIso() } : x)) } }));
  },

  /** Enregistre une expertise ; si `apply`, sa valeur devient celle du bien et de ses unités. */
  saveAppraisal(assetId: string, answers: AppraisalAnswers, result: AppraisalResult, by: "OWNER" | "AGENT", apply: boolean): string {
    const id = newId("ev");
    setState((s) => ({ ...s, appraisals: [...s.appraisals, { id, assetId, answers, result, createdAt: nowIso(), by, applied: false }] }));
    if (apply) actions.applyAppraisal(id);
    return id;
  },

  applyAppraisal(appraisalId: string) {
    setState((s) => {
      const ev = s.appraisals.find((x) => x.id === appraisalId);
      if (!ev) return s;
      const values = new Map(ev.result.perUnit.map((u) => [u.unitId, u.value.amount]));
      return {
        ...s,
        assets: s.assets.map((a) => (a.id === ev.assetId ? { ...a, value: ev.result.value } : a)),
        units: s.units.map((u) => (values.has(u.id) ? { ...u, details: { ...u.details, value: values.get(u.id) } } : u)),
        appraisals: s.appraisals.map((x) => (x.assetId === ev.assetId ? { ...x, applied: x.id === appraisalId } : x)),
      };
    });
  },

  /** Bien personnel ou de famille, et ses parts (remplacées en bloc). */
  setHolding(assetId: string, holding: Holding, shares: { holderId: string; sharePermille: number }[] = []) {
    setState((s) => ({
      ...s,
      assets: s.assets.map((a) => (a.id === assetId ? { ...a, holding } : a)),
      shares: [...s.shares.filter((x) => x.assetId !== assetId), ...(holding === "FAMILY" ? shares.filter((x) => x.sharePermille > 0).map((x) => ({ ...x, assetId })) : [])],
    }));
  },

  /** Invite un proche à suivre les biens de la famille. L'invitation part par SMS (lien à usage unique côté API). */
  inviteFamilyMember(input: { firstName: string; lastName: string; phone: string; relation: string; access: "VIEW" | "MANAGE" }): string {
    const id = newId("p");
    setState((s) => ({ ...s, parties: [...s.parties, { id, role: "FAMILY", ...input, invitedAt: nowIso() }] }));
    return id;
  },

  updateFamilyMember(partyId: string, patch: { relation?: string; access?: "VIEW" | "MANAGE"; invitedAt?: string }) {
    setState((s) => ({ ...s, parties: s.parties.map((p) => (p.id === partyId ? { ...p, ...patch } : p)) }));
  },

  /** Retire un proche : ses parts reviennent au propriétaire, pour que chaque bien reste réparti à 100 %. */
  removeFamilyMember(partyId: string) {
    setState((s) => {
      let shares = s.shares.filter((x) => x.holderId !== partyId);
      for (const r of s.shares.filter((x) => x.holderId === partyId)) {
        const owner = s.assets.find((a) => a.id === r.assetId)?.ownerId;
        if (!owner) continue;
        const i = shares.findIndex((y) => y.assetId === r.assetId && y.holderId === owner);
        shares = i >= 0 ? shares.map((y, j) => (j === i ? { ...y, sharePermille: y.sharePermille + r.sharePermille } : y)) : [...shares, { assetId: r.assetId, holderId: owner, sharePermille: r.sharePermille }];
      }
      return { ...s, parties: s.parties.filter((p) => p.id !== partyId), shares };
    });
  },

  updateAsset(assetId: string, patch: { name?: string; address?: string; city?: string; details?: Record<string, unknown>; value?: number | null }) {
    setState((s) => ({
      ...s,
      assets: s.assets.map((a) =>
        a.id !== assetId
          ? a
          : {
              ...a,
              name: patch.name ?? a.name,
              location: { ...a.location, address: patch.address ?? a.location.address, city: patch.city ?? a.location.city },
              details: patch.details ? { ...a.details, ...patch.details } : a.details,
              value: patch.value === null ? undefined : patch.value !== undefined ? { amount: patch.value, currency: a.currency } : a.value,
            },
      ),
    }));
  },

  updateUnit(unitId: string, patch: { label?: string; details?: Record<string, unknown> }) {
    setState((s) => ({
      ...s,
      units: s.units.map((u) => (u.id === unitId ? { ...u, label: patch.label ?? u.label, details: patch.details ? { ...u.details, ...patch.details } : u.details } : u)),
    }));
  },

  /** Retire une unité sans contrat en cours (l'historique des anciens contrats est conservé). */
  deleteUnit(unitId: string): boolean {
    if (state.agreements.some((g) => g.unitId === unitId && (!g.endDate || g.endDate >= today()))) return false;
    setState((s) => ({ ...s, units: s.units.filter((u) => u.id !== unitId) }));
    return true;
  },

  updateParty(partyId: string, patch: { firstName?: string; lastName?: string; phone?: string }) {
    setState((s) => ({ ...s, parties: s.parties.map((p) => (p.id === partyId ? { ...p, ...patch } : p)) }));
  },

  /**
   * Modifie un contrat. Les échéances du mois en cours et des mois suivants sans aucun encaissement
   * sont recalculées (montant, date) ; les mois passés et les sommes déjà reçues ne changent jamais.
   */
  updateLease(agreementId: string, patch: { amount?: number; deposit?: number; dueDay?: number; endDate?: string | null }) {
    const now = today();
    setState((s) => {
      const g = s.agreements.find((a) => a.id === agreementId);
      if (!g) return s;
      const c = g.periodicAmount.currency;
      const next: Agreement = {
        ...g,
        periodicAmount: patch.amount !== undefined ? { amount: patch.amount, currency: c } : g.periodicAmount,
        deposit: patch.deposit !== undefined ? { amount: patch.deposit, currency: c } : g.deposit,
        dueDay: patch.dueDay ?? g.dueDay,
        endDate: patch.endDate === null ? undefined : (patch.endDate ?? g.endDate),
      };
      const schedule = s.schedule
        .map((it) => {
          if (it.agreementId !== agreementId || it.status === "PAID" || it.received.amount > 0 || it.dueDate.slice(0, 7) < now.slice(0, 7)) return it;
          const dueDate = dueDateFor(it.dueDate.slice(0, 7), next.dueDay);
          const expected = next.periodicAmount;
          return { ...it, dueDate, expected, status: dueStatus(expected, it.received, dueDate, now) };
        })
        .filter((it) => it.agreementId !== agreementId || !next.endDate || it.dueDate <= next.endDate || it.status === "PAID");
      return { ...s, agreements: s.agreements.map((a) => (a.id === agreementId ? next : a)), schedule };
    });
  },

  /**
   * Occupant fictif sur une unité libre, pour tester : contrat commencé il y a quatre mois,
   * échéances passées marquées payées. Le nom porte la mention « fictif ».
   */
  addFakeOccupant(unitId: string): string | null {
    const unit = state.units.find((u) => u.id === unitId);
    const asset = unit && state.assets.find((a) => a.id === unit.assetId);
    if (!unit || !asset) return null;
    if (state.agreements.some((g) => g.unitId === unitId && (!g.endDate || g.endDate >= today()))) return null;
    const n = state.parties.length + seq;
    const first = FAKE_FIRST[n % FAKE_FIRST.length]!;
    const last = FAKE_LAST[(n * 7) % FAKE_LAST.length]!;
    const fr = asset.location.country === "FR";
    const phone = fr ? `+336${String(10_000_000 + ((n * 7919) % 89_999_999)).padStart(8, "0")}` : `+22507${String(10_000_000 + ((n * 7919) % 89_999_999)).padStart(8, "0")}`;
    const asking = typeof unit.details.askingRent === "number" && unit.details.askingRent > 0 ? unit.details.askingRent : FAKE_AMOUNT[asset.type] ?? 100_000;
    const amount = asset.currency === "XOF" ? asking : Math.max(asking, 50_000);
    const start = `${addMonths(currentMonth(), -4)}-01`;
    const { agreementId } = actions.createLease({
      assetId: asset.id,
      unitId,
      tenant: { firstName: first, lastName: `${last} (fictif)`, phone },
      startDate: start,
      rent: { amount, currency: asset.currency },
      deposit: { amount: asset.type === "REAL_ESTATE" ? amount * 2 : 0, currency: asset.currency },
      dueDay: 5,
    });
    const now = today();
    setState((s) => {
      const paidTx: Transaction[] = [];
      const schedule = s.schedule.map((it) => {
        if (it.agreementId !== agreementId || it.dueDate > now) return it;
        paidTx.push({ id: newId("t"), assetId: asset.id, scheduleItemId: it.id, direction: "IN", category: "RENT", amount: it.expected, occurredAt: `${it.dueDate}T09:00:00.000Z`, confirmedBy: "WEBHOOK", label: `${cap(profileOf(asset.type).amount)} (fictif)` });
        return { ...it, received: it.expected, status: "PAID" as const };
      });
      return { ...s, schedule, transactions: [...s.transactions, ...paidTx] };
    });
    return agreementId;
  },

  /** Occupants fictifs sur toutes les unités libres. Renvoie le nombre créé. */
  addFakeOccupants(): number {
    const occupied = new Set(state.agreements.filter((g) => !g.endDate || g.endDate >= today()).map((g) => g.unitId));
    const free = state.units.filter((u) => !occupied.has(u.id));
    free.forEach((u) => actions.addFakeOccupant(u.id));
    return free.length;
  },

  /** Met fin au bail : les échéances futures non payées sont retirées. */
  endLease(agreementId: string, endDate: string) {
    setState((s) => ({
      ...s,
      agreements: s.agreements.map((g) => (g.id === agreementId ? { ...g, endDate } : g)),
      schedule: s.schedule.filter((it) => it.agreementId !== agreementId || it.dueDate <= endDate || it.status === "PAID"),
    }));
  },

  addDocument(doc: Omit<Document, "id" | "createdAt">) {
    setState((s) => ({ ...s, documents: [...s.documents, { ...doc, id: newId("d"), createdAt: nowIso() }] }));
  },

  deleteDocument(id: string) {
    setState((s) => ({ ...s, documents: s.documents.filter((d) => d.id !== id) }));
  },

  /** Dépense saisie par le propriétaire (seuls les encaissements exigent un webhook). */
  addExpense(input: { assetId: string; category: string; label: string; amount: Money; date: string }) {
    const tx: Transaction = {
      id: newId("t"),
      assetId: input.assetId,
      direction: "OUT",
      category: input.category,
      amount: input.amount,
      occurredAt: `${input.date}T12:00:00.000Z`,
      confirmedBy: "MANUAL",
      label: input.label,
    };
    setState((s) => ({ ...s, transactions: [...s.transactions, tx] }));
  },

  /** Valide un devis : l'intervention est programmée au créneau proposé. Le paiement viendra en Phase 2. */
  approveQuote(eventId: string, quoteId: string) {
    setState((s) => ({
      ...s,
      events: s.events.map((e) => {
        if (e.id !== eventId) return e;
        const quote = e.quotes.find((q) => q.id === quoteId);
        if (!quote) return e;
        return { ...e, status: "SCHEDULED", scheduledAt: quote.slot, quotes: [quote] };
      }),
    }));
  },

  resolveEvent(eventId: string) {
    setState((s) => ({
      ...s,
      events: s.events.map((e) => (e.id === eventId ? { ...e, status: "RESOLVED", resolvedAt: nowIso() } : e)),
    }));
  },

  sendMessage(partyId: string, text: string) {
    setState((s) => ({ ...s, messages: [...s.messages, { id: newId("m"), partyId, from: "OWNER", text, at: nowIso() }] }));
  },

  /**
   * Ouvre (ou complète) une demande d'intervention et sollicite trois artisans de l'annuaire.
   * Données fictives : côté API, les artisans répondent depuis leur propre accès.
   */
  /** Artisan ajouté au carnet (saisi ou trouvé par l'agent sur le web : contact non vérifié). */
  addCraftsman(input: { name: string; trade: string; phone: string; city?: string; source?: string }): string {
    const existing = state.parties.find((p) => p.role === "CRAFTSMAN" && p.phone.replace(/\D/g, "") === input.phone.replace(/\D/g, ""));
    if (existing) return existing.id;
    const id = newId("p");
    setState((s) => ({ ...s, parties: [...s.parties, { id, role: "CRAFTSMAN", firstName: input.name, lastName: "", phone: input.phone, trade: input.trade, city: input.city, source: input.source }] }));
    return id;
  },

  /**
   * Demande de devis adressée à des artisans du carnet : la demande leur est consignée et l'on
   * attend leurs réponses (pas de devis inventé).
   */
  requestQuotesFrom(input: { assetId: string; eventId?: string; title: string; description: string; category: string; urgency: "LOW" | "MEDIUM" | "HIGH" }, partyIds: string[], text: string): string {
    const eventId = input.eventId ?? newId("e");
    setState((s) => {
      const messages = [...s.messages, ...partyIds.map((partyId) => ({ id: newId("m"), partyId, from: "OWNER" as const, text, at: nowIso() }))];
      const existing = s.events.find((e) => e.id === eventId);
      if (existing) return { ...s, messages, events: s.events.map((e) => (e.id === eventId ? { ...e, status: "QUOTES_PENDING" } : e)) };
      const event: AssetEvent = { id: eventId, assetId: input.assetId, kind: "INCIDENT", category: input.category, title: input.title, description: input.description, urgency: input.urgency, status: "QUOTES_PENDING", reportedAt: nowIso(), photos: [], quotes: [] };
      return { ...s, messages, events: [...s.events, event] };
    });
    return eventId;
  },

  requestQuotes(input: { assetId: string; eventId?: string; title: string; description: string; category: string; urgency: "LOW" | "MEDIUM" | "HIGH" }): string {
    const eventId = input.eventId ?? newId("e");
    const base = QUOTE_BASE[input.category] ?? 40_000;
    const currency = state.assets.find((a) => a.id === input.assetId)?.currency ?? "XOF";
    const scale = currency === "XOF" ? 1 : 0.15; // ordre de grandeur en centimes pour l'euro
    const quotes = ARTISANS.map((a, i) => ({
      id: newId("q"),
      // Devis de démonstration : marqués comme tels partout où ils s'affichent.
      provider: `${a.name}, ${CATEGORY_TRADE[input.category] ?? "artisan"} (démo)`,
      rating: a.rating,
      slot: `${addDays(today(), i + 1)}T${["09", "14", "10"][i]}:00:00.000Z`,
      amount: { amount: Math.round((base * a.factor * scale) / 500) * 500, currency },
    }));
    setState((s) => {
      const existing = s.events.find((e) => e.id === eventId);
      if (existing) return { ...s, events: s.events.map((e) => (e.id === eventId ? { ...e, status: "QUOTES_PENDING", quotes } : e)) };
      const event: AssetEvent = {
        id: eventId,
        assetId: input.assetId,
        kind: "INCIDENT",
        category: input.category,
        title: input.title,
        description: input.description,
        urgency: input.urgency,
        status: "QUOTES_PENDING",
        reportedAt: nowIso(),
        photos: [],
        quotes,
      };
      return { ...s, events: [...s.events, event] };
    });
    return eventId;
  },

  addMaintenance(input: Omit<MaintenancePlan, "id">): string {
    const id = newId("mp");
    setState((s) => ({ ...s, maintenance: [...s.maintenance, { ...input, id }] }));
    return id;
  },

  /** Entretien fait : la prochaine échéance est recalculée. */
  completeMaintenance(id: string) {
    setState((s) => ({
      ...s,
      maintenance: s.maintenance.map((m) => (m.id === id ? { ...m, lastDoneOn: today(), nextDueOn: `${addMonths(today().slice(0, 7), m.everyMonths)}-${today().slice(8, 10)}` } : m)),
    }));
  },

  /** Confie une mission à un gérant terrain ; le gérant est créé s'il n'existe pas encore. */
  assignMission(input: { assetId: string; kind: MissionKind; title: string; dueDate: string; managerPartyId?: string; managerName?: string; managerPhone?: string }): { missionId: string; partyId: string } {
    let partyId = input.managerPartyId ?? state.parties.find((p) => p.role === "FIELD_MANAGER")?.id;
    const newParty: Party | undefined =
      !partyId || !state.parties.some((p) => p.id === partyId)
        ? { id: (partyId = newId("p")), role: "FIELD_MANAGER", firstName: input.managerName?.split(" ")[0] ?? "Gérant", lastName: input.managerName?.split(" ").slice(1).join(" ") ?? "", phone: input.managerPhone ?? "" }
        : undefined;
    const missionId = newId("mi");
    const mission: Mission = { id: missionId, assetId: input.assetId, partyId: partyId!, kind: input.kind, title: input.title, dueDate: input.dueDate, status: "PLANNED", photos: [] };
    setState((s) => ({ ...s, parties: newParty ? [...s.parties, newParty] : s.parties, missions: [...s.missions, mission] }));
    return { missionId, partyId: partyId! };
  },

  completeMission(id: string, report: string) {
    setState((s) => ({ ...s, missions: s.missions.map((m) => (m.id === id ? { ...m, status: "DONE", report } : m)) }));
  },

  /** Applique ce que les agents autonomes ont fait (quittance, incident qualifié, rappel…). */
  applyAgentMutations(muts: AgentMutation[]) {
    if (!muts.length) return;
    setState((s) => {
      let next = { ...s };
      const notices: AgentNotice[] = [];
      for (const m of muts) {
        const p = m.payload;
        if (next.agentNotices.some((n) => n.id === m.id)) continue;
        if (m.type === "event.update" && typeof p.eventId === "string") {
          const patch: Partial<AssetEvent> = {};
          if (typeof p.category === "string") patch.category = p.category;
          if (p.urgency === "LOW" || p.urgency === "MEDIUM" || p.urgency === "HIGH") patch.urgency = p.urgency;
          if (typeof p.aiSummary === "string") patch.aiSummary = p.aiSummary;
          if (p.status === "OPEN" || p.status === "QUOTES_PENDING" || p.status === "SCHEDULED" || p.status === "RESOLVED") patch.status = p.status;
          if (typeof p.scheduledAt === "string") patch.scheduledAt = p.scheduledAt;
          next = { ...next, events: next.events.map((e) => (e.id === p.eventId ? { ...e, ...patch } : e)) };
          const e = next.events.find((x) => x.id === p.eventId);
          if (e) notices.push({ id: m.id, at: m.createdAt, title: patch.aiSummary ? "Incident qualifié par Keyo" : "Incident mis à jour par Keyo", body: e.title, href: `/incident/${e.id}` });
        } else if (m.type === "receipt.issue" && typeof p.scheduleItemId === "string") {
          const it = next.schedule.find((x) => x.id === p.scheduleItemId);
          const g = it && next.agreements.find((a) => a.id === it.agreementId);
          if (it && g) {
            next = { ...next, documents: [...next.documents, { id: newId("d"), assetId: g.assetId, agreementId: g.id, kind: "RECEIPT", label: `Quittance du ${it.dueDate}`, url: "", createdAt: m.createdAt }] };
            notices.push({ id: m.id, at: m.createdAt, title: "Quittance envoyée", body: `Échéance du ${it.dueDate}`, href: `/bail/${g.id}` });
          }
        } else if (m.type === "mission.create") {
          notices.push({ id: m.id, at: m.createdAt, title: "Visite planifiée", body: String(p.label ?? ""), href: typeof p.assetId === "string" ? `/bien/${p.assetId}` : undefined });
        } else if (m.type === "notification") {
          notices.push({ id: m.id, at: m.createdAt, title: String(p.title ?? "Keyo"), body: String(p.body ?? ""), href: typeof p.link === "string" ? p.link : undefined });
        }
      }
      return { ...next, agentNotices: [...next.agentNotices, ...notices].slice(-100) };
    });
  },

  markNotificationsRead() {
    setState((s) => ({ ...s, notificationsReadAt: nowIso() }));
  },
};
