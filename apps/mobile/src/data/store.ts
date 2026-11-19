import { useSyncExternalStore } from "react";
import type { Agreement, Asset, AssetEvent, AssetUnit, Document, Party, ScheduleItem, Transaction } from "@keyo/shared";
import * as mock from "./mock";

export type OwnerState = {
  assets: Asset[];
  units: AssetUnit[];
  parties: Party[];
  agreements: Agreement[];
  schedule: ScheduleItem[];
  transactions: Transaction[];
  events: AssetEvent[];
  documents: Document[];
};

/**
 * Magasin local, en mémoire. Il sera remplacé par le client API (avec cache hors ligne et
 * file d'attente des actions) sans changer les écrans, qui ne passent que par les sélecteurs.
 */
let state: OwnerState = {
  assets: mock.assets,
  units: mock.units,
  parties: mock.parties,
  agreements: mock.agreements,
  schedule: mock.schedule,
  transactions: mock.transactions,
  events: mock.events,
  documents: mock.documents,
};
const listeners = new Set<() => void>();

const setState = (next: (s: OwnerState) => OwnerState) => {
  state = next(state);
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

export const actions = {
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

  addAsset(input: { asset: Asset; units: AssetUnit[] }) {
    setState((s) => ({ ...s, assets: [...s.assets, input.asset], units: [...s.units, ...input.units] }));
  },
};
