import { cardBrand, type CardDetails } from "@keyo/shared";

/**
 * Prestataire de paiement par carte, côté téléphone. La carte est saisie dans SON formulaire et
 * n'est jamais envoyée à Keyo : on n'obtient qu'un jeton, transmis au serveur.
 * Simulé pour l'instant ; avec Stripe : PaymentSheet (SetupIntent) à la place de CardSheet.
 */
export const CARD_PROVIDER_SIMULATED = true;

/** Simulation de ce que ferait le prestataire : il garde la carte et renvoie un jeton. */
export function simulateTokenize(number: string, expMonth: number, expYear: number): string {
  const d = number.replace(/\D/g, "");
  const details: CardDetails = { brand: cardBrand(d), last4: d.slice(-4), expMonth, expYear };
  const json = JSON.stringify(details);
  // base64url sans dépendance : btoa est disponible dans React Native (Hermes).
  return `tok_sim_${btoa(json).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}`;
}
