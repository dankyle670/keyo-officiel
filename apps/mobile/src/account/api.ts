import { apiBase } from "@/agent/api";
import { ownerHeader } from "@/billing/api";

/** Suppression du compte côté serveur (apps/api, /account), confirmée par code SMS. */
export class AccountApiError extends Error {}

async function post<T>(path: string, body?: unknown): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20_000);
  try {
    const res = await fetch(`${apiBase()}/account${path}`, {
      method: "POST",
      signal: ctrl.signal,
      headers: { "content-type": "application/json", "x-keyo-owner": ownerHeader() },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) throw new AccountApiError(data.error ?? `Erreur ${res.status}`);
    return data as T;
  } catch (e) {
    if (e instanceof AccountApiError) throw e;
    throw new AccountApiError("Serveur Keyo injoignable. La suppression demande une connexion : réessayez une fois connecté.");
  } finally {
    clearTimeout(timer);
  }
}

export type DeletionChallenge = { challengeId: string; simulated: boolean; expiresInSeconds: number };
export type DeletionReport = { conversations: number; paymentAccounts: number; subscriptionStopped: boolean; receiptsKept: number };

export const accountApi = {
  requestDeletion: () => post<DeletionChallenge>("/delete/request"),
  confirmDeletion: (challengeId: string, code: string) => post<DeletionReport>("/delete/confirm", { challengeId, code }),
};
