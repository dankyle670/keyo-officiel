import { CARD_BRANDS, type CardDetails } from "@keyo/shared";

/**
 * Prestataire de paiement par carte (abonnement Keyo). La carte est saisie chez le prestataire ;
 * Keyo ne reçoit qu'un jeton, que le prestataire transforme en moyen de paiement réutilisable
 * (référence) et dont il donne marque, 4 derniers chiffres et expiration.
 * Branchement réel prévu : Stripe (SetupIntent, PaymentSheet) ou CinetPay selon le compte ouvert.
 */
export interface CardProvider {
  readonly simulated: boolean;
  resolve(token: string): Promise<CardDetails & { ref: string }>;
}

export class CardError extends Error {}

/** Prestataire simulé : le jeton de test porte lui-même les informations que renverrait le prestataire. */
export class SimulatedCardProvider implements CardProvider {
  readonly simulated = true;
  async resolve(token: string) {
    const m = /^tok_sim_([A-Za-z0-9_-]+)$/.exec(token);
    if (!m) throw new CardError("Jeton de carte invalide.");
    let d: Partial<CardDetails>;
    try {
      d = JSON.parse(Buffer.from(m[1]!, "base64url").toString("utf8")) as Partial<CardDetails>;
    } catch {
      throw new CardError("Jeton de carte illisible.");
    }
    if (!d.brand || !CARD_BRANDS.includes(d.brand) || !/^\d{4}$/.test(d.last4 ?? "") || !Number.isInteger(d.expMonth) || !Number.isInteger(d.expYear) || d.expMonth! < 1 || d.expMonth! > 12) throw new CardError("Carte refusée par le prestataire.");
    return { brand: d.brand, last4: d.last4!, expMonth: d.expMonth!, expYear: d.expYear!, ref: `pm_sim_${m[1]!.slice(0, 16)}` };
  }
}
