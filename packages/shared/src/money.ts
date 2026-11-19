import { z } from "zod";

/** Devises gérées. XOF (FCFA) et EUR dès le MVP, CAD et USD pour la diaspora. */
export const CURRENCIES = ["XOF", "EUR", "CAD", "USD"] as const;
export const Currency = z.enum(CURRENCIES);
export type Currency = z.infer<typeof Currency>;

/** Nombre de décimales de l'unité mineure. Le FCFA n'a pas de centimes. */
export const MINOR_UNITS: Record<Currency, number> = { XOF: 0, EUR: 2, CAD: 2, USD: 2 };

const LABEL: Record<Currency, string> = { XOF: "FCFA", EUR: "€", CAD: "$ CA", USD: "$ US" };

/**
 * Montant en unités mineures entières + code devise. Jamais de float pour l'argent.
 * Exemple : 150 000 FCFA → { amount: 150000, currency: "XOF" } ; 8 € → { amount: 800, currency: "EUR" }.
 */
export const Money = z.object({
  amount: z.number().int(),
  currency: Currency,
});
export type Money = z.infer<typeof Money>;

export const money = (amount: number, currency: Currency): Money => {
  if (!Number.isInteger(amount)) throw new Error(`Montant non entier : ${amount}`);
  return { amount, currency };
};

export const currencyLabel = (c: Currency) => LABEL[c];

/** « 150 000 » : nombre formaté à la française, sans la devise (affichée à part, plus petite). */
export function formatAmount({ amount, currency }: Money): string {
  const digits = MINOR_UNITS[currency];
  const negative = amount < 0;
  const abs = Math.abs(amount);
  const unit = 10 ** digits;
  const whole = Math.floor(abs / unit);
  const frac = abs % unit;
  // Espace insécable fine entre les milliers, comme en typographie française.
  const grouped = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  const decimals = digits > 0 && frac > 0 ? "," + String(frac).padStart(digits, "0") : "";
  return (negative ? "−" : "") + grouped + decimals;
}

/** « 150 000 FCFA ». */
export const formatMoney = (m: Money) => `${formatAmount(m)} ${currencyLabel(m.currency)}`;

export function addMoney(a: Money, b: Money): Money {
  if (a.currency !== b.currency) throw new Error(`Devises différentes : ${a.currency} et ${b.currency}`);
  return { amount: a.amount + b.amount, currency: a.currency };
}

export const sumMoney = (items: Money[], currency: Currency): Money =>
  items.reduce((acc, m) => addMoney(acc, m), money(0, currency));
