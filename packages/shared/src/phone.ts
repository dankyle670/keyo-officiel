/** Indicatifs pris en charge à l'inscription : Côte d'Ivoire d'abord, puis la diaspora. */
export const PHONE_COUNTRIES = [
  { code: "CI", dial: "+225", label: "Côte d'Ivoire", digits: 10, currency: "XOF" },
  { code: "FR", dial: "+33", label: "France", digits: 9, currency: "EUR" },
  { code: "CA", dial: "+1", label: "Canada", digits: 10, currency: "CAD" },
  { code: "US", dial: "+1", label: "États-Unis", digits: 10, currency: "USD" },
] as const;
export type PhoneCountry = (typeof PHONE_COUNTRIES)[number];

/** Numéro au format E.164 (« +2250700000001 »), ou null s'il est invalide. */
export function toE164(country: PhoneCountry, local: string): string | null {
  let digits = local.replace(/\D/g, "");
  // En France on tape souvent le 0 initial : 06 12 34 56 78 → 6 12 34 56 78.
  if (country.code === "FR" && digits.length === 10 && digits.startsWith("0")) digits = digits.slice(1);
  if (digits.length !== country.digits) return null;
  return `${country.dial}${digits}`;
}

/** « 07 00 00 00 01 » : affichage par paires (ou triplets pour l'Amérique du Nord). */
export function formatLocal(country: PhoneCountry, local: string): string {
  const d = local.replace(/\D/g, "").slice(0, country.code === "FR" ? 10 : country.digits);
  if (country.dial === "+1") return d.replace(/^(\d{3})(\d{0,3})(\d{0,4}).*/, (_, a, b, c) => [a, b, c].filter(Boolean).join(" "));
  return d.replace(/(\d{2})(?=\d)/g, "$1 ");
}
