import { useSyncExternalStore } from "react";
import {
  addMonths,
  buildMonthlySchedule,
  type Agreement,
  type Asset,
  type AssetEvent,
  type AssetUnit,
  type Document,
  type Money,
  type Party,
  type ScheduleItem,
  type Transaction,
} from "@keyo/shared";
import { createDemoState, createEmptyState } from "./mock";
import { KEYS, load, remove, save } from "./persist";
import { currentMonth, nowIso, today } from "./period";

export type Message = { id: string; partyId: string; from: "OWNER" | "PARTY"; text: string; at: string };

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
  notificationsReadAt: string;
};

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
      };
    });
  },

  addUnit(assetId: string, label: string, rooms: number, rent: number) {
    setState((s) => ({ ...s, units: [...s.units, { id: newId("u"), assetId, type: "DWELLING", label, details: { rooms, askingRent: rent } }] }));
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

  markNotificationsRead() {
    setState((s) => ({ ...s, notificationsReadAt: nowIso() }));
  },
};
