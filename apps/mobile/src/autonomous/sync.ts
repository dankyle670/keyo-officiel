import { useEffect, useSyncExternalStore } from "react";
import { AppState } from "react-native";
import { actions, getOwnerState, subscribeOwnerState, type OwnerState } from "@/data/store";
import type { User } from "@/data/session";
import { autonomousApi, setAutonomousOwner } from "./api";

/**
 * Synchronisation avec le serveur, tant que les données vivent sur le téléphone :
 * - l'app envoie l'état de ses données (après chaque modification, regroupées sur 3 s) ;
 * - elle récupère ce que les agents ont fait et l'applique (à l'ouverture, puis chaque minute).
 * Hors ligne, rien ne casse : l'app continue seule et réessaie plus tard.
 */
export type SyncStatus = { reachable: boolean | null; lastSync?: string; error?: string };
let status: SyncStatus = { reachable: null };
const listeners = new Set<() => void>();
const setStatus = (s: Partial<SyncStatus>) => {
  status = { ...status, ...s };
  listeners.forEach((l) => l());
};
export const useSyncStatus = () =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => status,
  );

const snapshotOf = (s: OwnerState, user: User) => ({
  ownerName: [user.firstName, user.lastName].filter(Boolean).join(" ") || undefined,
  currency: user.displayCurrency,
  assets: s.assets,
  units: s.units,
  parties: s.parties,
  agreements: s.agreements,
  schedule: s.schedule,
  transactions: s.transactions,
  events: s.events,
  documents: s.documents,
  shares: s.shares,
});

let current: User | null = null;

/** Envoie les données puis applique les actions des agents. Renvoie faux si le serveur est injoignable. */
export async function syncNow(): Promise<boolean> {
  if (!current) return false;
  try {
    await autonomousApi.putSnapshot(snapshotOf(getOwnerState(), current));
    actions.applyAgentMutations(await autonomousApi.pullMutations());
    setStatus({ reachable: true, lastSync: new Date().toISOString(), error: undefined });
    return true;
  } catch (e) {
    setStatus({ reachable: false, error: e instanceof Error ? e.message : "Synchronisation impossible." });
    return false;
  }
}

/** À monter une fois dans l'espace propriétaire. */
export function useAutonomousSync(user: User) {
  useEffect(() => {
    current = user;
    setAutonomousOwner(user.id);
    void syncNow();
    let debounce: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = subscribeOwnerState(() => {
      clearTimeout(debounce);
      debounce = setTimeout(() => void syncNow(), 3000);
    });
    const poll = setInterval(() => {
      if (AppState.currentState === "active") void syncNow();
    }, 60_000);
    const app = AppState.addEventListener("change", (s) => s === "active" && void syncNow());
    return () => {
      unsubscribe();
      clearTimeout(debounce);
      clearInterval(poll);
      app.remove();
    };
  }, [user.id, user.firstName, user.lastName, user.displayCurrency]);
}
