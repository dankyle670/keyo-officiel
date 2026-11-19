import type { Asset, AssetShare } from "./domain.ts";
import type { Currency, Money } from "./money.ts";

/**
 * Patrimoine : valeur des biens et part de chaque détenteur. Un bien personnel appartient en
 * entier à son propriétaire ; un bien de famille est réparti selon les parts (pour mille).
 * Montants en entiers (unité mineure), une ligne de total par devise, jamais de conversion implicite.
 */
export function assetValue(a: Asset): Money | null {
  if (a.value && a.value.amount > 0) return a.value;
  const p = a.details.purchasePrice;
  return typeof p === "number" && p > 0 ? { amount: p, currency: a.currency } : null;
}

export type Holder = { holderId: string; sharePermille: number };

export function sharesOf(a: Asset, shares: AssetShare[]): Holder[] {
  const list = shares.filter((s) => s.assetId === a.id);
  if (a.holding !== "FAMILY" || list.length === 0) return [{ holderId: a.ownerId, sharePermille: 1000 }];
  return list.map(({ holderId, sharePermille }) => ({ holderId, sharePermille }));
}

export const shareTotal = (a: Asset, shares: AssetShare[]) => sharesOf(a, shares).reduce((n, s) => n + s.sharePermille, 0);

export const partOf = (m: Money, permille: number): Money => ({ amount: Math.round((m.amount * permille) / 1000), currency: m.currency });

/** « 33,3 % » à partir de pour mille. */
export const formatShare = (permille: number) => `${(permille / 10).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %`;

export type PatrimonyLine = { assetId: string; sharePermille: number; value: Money | null; part: Money | null };
export type Patrimony = { lines: PatrimonyLine[]; totals: Money[]; unvalued: number };

function totalsOf(parts: (Money | null)[]): Money[] {
  const by = new Map<Currency, number>();
  for (const p of parts) if (p) by.set(p.currency, (by.get(p.currency) ?? 0) + p.amount);
  return [...by].map(([currency, amount]) => ({ amount, currency }));
}

/** Biens détenus par un détenteur (propriétaire ou membre), avec la valeur de sa part. */
export function holderPatrimony(assets: Asset[], shares: AssetShare[], holderId: string): Patrimony {
  const lines: PatrimonyLine[] = [];
  for (const a of assets) {
    const h = sharesOf(a, shares).find((s) => s.holderId === holderId);
    if (!h) continue;
    const value = assetValue(a);
    lines.push({ assetId: a.id, sharePermille: h.sharePermille, value, part: value ? partOf(value, h.sharePermille) : null });
  }
  return { lines, totals: totalsOf(lines.map((l) => l.part)), unvalued: lines.filter((l) => !l.value).length };
}

/** Valeur totale des biens, toutes parts confondues. */
export function totalPatrimony(assets: Asset[]): Money[] {
  return totalsOf(assets.map(assetValue));
}
