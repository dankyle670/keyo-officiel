import { File, Paths } from "expo-file-system";
import type { BillingPeriod, InvoiceView, PaymentAttemptView, Plan, SubscriptionView } from "@keyo/shared";
import { apiBase } from "@/agent/api";
import { getSession } from "@/data/session";
import { actions } from "@/data/store";

/** Client de l'abonnement Keyo (apps/api, /billing). */
export class BillingApiError extends Error {}

export const ownerHeader = () => {
  const s = getSession();
  return s.status === "signedIn" ? s.user.id.replace(/[^\w-]/g, "").slice(0, 64) : "";
};

async function call<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15_000);
  try {
    const res = await fetch(`${apiBase()}/billing${path}`, {
      method,
      signal: ctrl.signal,
      headers: { "content-type": "application/json", "x-keyo-owner": ownerHeader() },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) throw new BillingApiError(data.error ?? `Erreur ${res.status}`);
    return data as T;
  } catch (e) {
    if (e instanceof BillingApiError) throw e;
    throw new BillingApiError("Serveur Keyo injoignable. Vérifiez votre connexion et réessayez.");
  } finally {
    clearTimeout(timer);
  }
}

const keep = (v: SubscriptionView) => {
  actions.setSubscription(v);
  return v;
};

export const billingApi = {
  view: () => call<SubscriptionView>("").then(keep),
  plans: () => call<Plan[]>("/plans"),
  invoices: () => call<InvoiceView[]>("/invoices"),
  setPeriod: (period: BillingPeriod) => call<SubscriptionView>("/period", "POST", { period }).then(keep),
  cancel: (cancel: boolean) => call<SubscriptionView>("/cancel", "POST", { cancel }).then(keep),
  pay: () => call<PaymentAttemptView>("/pay", "POST"),
  attempt: (id: string) => call<PaymentAttemptView>(`/attempts/${id}`),
  /** Démonstration : valider ou refuser la demande Mobile Money comme sur le téléphone. */
  simulate: (id: string, approve: boolean) => call<PaymentAttemptView>(`/attempts/${id}/simulate`, "POST", { approve }),
  /** Télécharge le reçu PDF dans le cache et renvoie son adresse locale (pour le partager). */
  async receipt(inv: InvoiceView) {
    const dest = new File(Paths.cache, `${inv.number}.pdf`);
    if (dest.exists) dest.delete();
    const f = await File.downloadFileAsync(`${apiBase()}/billing/invoices/${inv.id}/receipt`, dest, { headers: { "x-keyo-owner": ownerHeader() } });
    return f.uri;
  },
};

/** Rafraîchit l'abonnement sans bloquer (serveur injoignable : on garde la dernière vue). */
export const refreshSubscription = () => billingApi.view().catch(() => undefined);
