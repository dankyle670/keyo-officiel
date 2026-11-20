import type { NewPaymentAccount, PaymentAccountView } from "@keyo/shared";
import { apiBase } from "@/agent/api";
import { getSession } from "@/data/session";
import { actions } from "@/data/store";

/** Client des comptes de paiement (apps/api, /payment-accounts). Les numéros ne reviennent que masqués. */
export type Challenge = { challengeId: string; sentTo: string; simulated: boolean; expiresInSeconds: number };
export type Change = { op: "VERIFY" } | { op: "UPDATE"; patch: { assetIds?: string[]; isDefault?: boolean } } | { op: "DELETE" };

export class PaymentApiError extends Error {}

const ownerId = () => {
  const s = getSession();
  return s.status === "signedIn" ? s.user.id.replace(/[^\w-]/g, "").slice(0, 64) : "";
};

async function call<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15_000);
  try {
    const res = await fetch(`${apiBase()}/payment-accounts${path}`, {
      method,
      signal: ctrl.signal,
      headers: { "content-type": "application/json", "x-keyo-owner": ownerId() },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) throw new PaymentApiError(data.error ?? `Erreur ${res.status}`);
    return data as T;
  } catch (e) {
    if (e instanceof PaymentApiError) throw e;
    throw new PaymentApiError("Serveur Keyo injoignable. Vérifiez votre connexion et réessayez.");
  } finally {
    clearTimeout(timer);
  }
}

export const paymentApi = {
  async list() {
    const list = await call<PaymentAccountView[]>("");
    actions.setPaymentAccounts(list);
    return list;
  },
  create: (a: NewPaymentAccount) => call<{ account: PaymentAccountView; challenge: Challenge }>("", "POST", a),
  /** Carte de l'abonnement : seul le jeton du prestataire est envoyé. */
  async addCard(token: string) {
    const r = await call<{ account: PaymentAccountView; accounts: PaymentAccountView[]; simulated: boolean }>("/cards", "POST", { token });
    actions.setPaymentAccounts(r.accounts);
    return r;
  },
  requestChange: (id: string, change: Change) => call<Challenge>(`/${id}/changes`, "POST", change),
  async confirm(challengeId: string, code: string) {
    const r = await call<{ op: string; accounts: PaymentAccountView[] }>(`/challenges/${challengeId}/confirm`, "POST", { code });
    actions.setPaymentAccounts(r.accounts);
    return r;
  },
};

/** Rafraîchit la copie locale sans bruit (hors ligne : on garde la dernière connue). */
export const refreshPaymentAccounts = () => paymentApi.list().catch(() => undefined);
