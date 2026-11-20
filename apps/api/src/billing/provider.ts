import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

/**
 * Prestataire qui encaisse l'abonnement : carte (prélèvement) ou Mobile Money (demande à valider
 * par le propriétaire avec son code). Un paiement n'est « payé » qu'à réception du webhook signé.
 * Simulé pour l'instant ; CinetPay ou PayDunya (Mobile Money), Stripe ou CinetPay (carte) ensuite.
 */
export type ChargeRequest = { attemptId: string; method: "CARD" | "MOBILE_MONEY"; amount: number; currency: string; accountLabel: string };
export type WebhookEvent = { providerRef: string; status: "SUCCEEDED" | "FAILED"; reason?: string };

export interface BillingProvider {
  readonly simulated: boolean;
  /** Lance l'encaissement ; le résultat arrive plus tard par webhook. */
  charge(req: ChargeRequest): Promise<{ providerRef: string }>;
  /** Vérifie la signature d'un webhook et renvoie l'événement, ou null. */
  verify(body: unknown, signature: string | undefined): WebhookEvent | null;
}

const secret = () => process.env.KEYO_WEBHOOK_SECRET ?? "keyo-dev-webhook-secret";
export const sign = (e: WebhookEvent) => createHmac("sha256", secret()).update(`${e.providerRef}:${e.status}:${e.reason ?? ""}`).digest("hex");

/**
 * Prestataire simulé. Carte : accepté après 2 secondes, sauf carte se terminant par 0002 (refusée,
 * comme la carte de test de Stripe). Mobile Money : attend la validation du propriétaire (écran de
 * démonstration de l'app). Le résultat repasse par le même webhook signé que le vrai prestataire.
 */
export class SimulatedBillingProvider implements BillingProvider {
  readonly simulated = true;
  /** Branché par le service : livraison du webhook. */
  deliver?: (body: WebhookEvent, signature: string) => Promise<unknown>;

  async charge(req: ChargeRequest) {
    const providerRef = `sim_${randomUUID()}`;
    if (req.method === "CARD") {
      const declined = /0002$/.test(req.accountLabel.replace(/\D/g, ""));
      setTimeout(() => void this.emit({ providerRef, status: declined ? "FAILED" : "SUCCEEDED", reason: declined ? "Carte refusée par la banque." : undefined }), 2000).unref();
    }
    return { providerRef };
  }

  /** Démonstration : le propriétaire valide (ou refuse) la demande Mobile Money sur son téléphone. */
  emit(e: WebhookEvent) {
    return this.deliver?.(e, sign(e));
  }

  verify(body: unknown, signature: string | undefined): WebhookEvent | null {
    const e = body as Partial<WebhookEvent> | null;
    if (!e || typeof e.providerRef !== "string" || (e.status !== "SUCCEEDED" && e.status !== "FAILED") || !signature) return null;
    const expected = Buffer.from(sign(e as WebhookEvent));
    const got = Buffer.from(signature);
    return expected.length === got.length && timingSafeEqual(expected, got) ? (e as WebhookEvent) : null;
  }
}
