import type { Agreement, Asset, AssetUnit, Document } from "./domain.ts";
import type { Currency, Money } from "./money.ts";

/**
 * Évaluation indicative d'un bien, globale et par unité. Déterministe : l'agent s'appuie dessus
 * et l'affine avec les documents, sans inventer de chiffre. Deux méthodes :
 * - par le revenu : montant annuel (contrat en cours, sinon montant demandé) capitalisé au
 *   rendement brut de référence du pays et du type ;
 * - par le coût : prix d'achat (décoté chaque année pour un véhicule).
 * Les valeurs saisies par le propriétaire (bien ou unité) priment toujours.
 */

/** Rendements bruts de référence, en pour mille, indicatifs (marché local, à affiner par un expert). */
const YIELD: Record<string, Partial<Record<Asset["type"], number>>> = {
  CI: { REAL_ESTATE: 80, SHOP: 100, PLANTATION: 120, FARM: 150, VEHICLE: 300 },
  DEFAULT: { REAL_ESTATE: 50, SHOP: 65, PLANTATION: 60, FARM: 80, VEHICLE: 250 },
};
/** Décote annuelle d'un véhicule, en pour mille. */
const VEHICLE_DEPRECIATION = 150;

export const referenceYield = (a: Asset) => YIELD[a.location.country]?.[a.type] ?? YIELD.DEFAULT![a.type] ?? 60;

export type UnitValuation = {
  unitId: string;
  label: string;
  monthly: Money | null;
  source: "LEASE" | "ASKING" | "NONE";
  incomeValue: Money | null;
  declared: Money | null;
  /** Valeur retenue : saisie, sinon par le revenu, sinon quote-part du coût. */
  value: Money | null;
};

export type Valuation = {
  assetId: string;
  currency: Currency;
  yieldPermille: number;
  units: UnitValuation[];
  incomeValue: Money | null;
  costValue: Money | null;
  declared: Money | null;
  suggested: Money | null;
  low: Money | null;
  high: Money | null;
  method: string;
  confidence: "LOW" | "MEDIUM" | "HIGH";
  /** Ce qui rendrait l'évaluation plus sûre. */
  missing: string[];
};

export type ValuationInput = { asset: Asset; units: AssetUnit[]; agreements: Agreement[]; documents: Document[]; today: string };

const m = (amount: number, currency: Currency): Money => ({ amount: Math.max(0, Math.round(amount)), currency });
/** Arrondi lisible : trois chiffres significatifs. */
export function roundValue(x: Money): Money {
  if (x.amount < 1000) return x;
  const step = 10 ** (String(Math.round(x.amount)).length - 3);
  return m(Math.round(x.amount / step) * step, x.currency);
}

export function valueAsset({ asset, units, agreements, documents, today }: ValuationInput): Valuation {
  const c = asset.currency;
  const y = referenceYield(asset);
  const own = units.filter((u) => u.assetId === asset.id);
  const docs = documents.filter((d) => d.assetId === asset.id);
  const current = agreements.filter((g) => g.assetId === asset.id && g.startDate <= today && (!g.endDate || g.endDate >= today));

  const unitRows = own.map((u) => {
    const lease = current.find((g) => g.unitId === u.id);
    const asking = typeof u.details.askingRent === "number" && u.details.askingRent > 0 ? u.details.askingRent : 0;
    const monthly = lease ? lease.periodicAmount.amount : asking;
    const source: UnitValuation["source"] = lease ? "LEASE" : asking ? "ASKING" : "NONE";
    const incomeValue = monthly && asset.type !== "VEHICLE" ? roundValue(m((monthly * 12 * 1000) / y, c)) : null;
    const declared = typeof u.details.value === "number" && u.details.value > 0 ? m(u.details.value, c) : null;
    return { unitId: u.id, label: u.label, monthly: monthly ? m(monthly, c) : null, source, incomeValue, declared, value: declared ?? incomeValue };
  });

  const purchase = typeof asset.details.purchasePrice === "number" && asset.details.purchasePrice > 0 ? asset.details.purchasePrice : 0;
  let costValue: Money | null = null;
  if (purchase) {
    if (asset.type === "VEHICLE") {
      const years = Math.max(0, (Date.parse(today) - Date.parse(asset.createdAt)) / (365.25 * 86_400_000));
      costValue = roundValue(m(purchase * ((1000 - VEHICLE_DEPRECIATION) / 1000) ** years, c));
    } else costValue = m(purchase, c);
  }

  const unitSum = unitRows.reduce((n, u) => n + (u.value?.amount ?? 0), 0);
  const incomeSum = unitRows.reduce((n, u) => n + (u.incomeValue?.amount ?? 0), 0);
  const incomeValue = incomeSum ? m(incomeSum, c) : null;
  const declared = asset.value && asset.value.amount > 0 ? asset.value : null;

  let suggested: Money | null;
  let method: string;
  if (unitRows.length && unitRows.every((u) => u.declared)) {
    suggested = m(unitSum, c);
    method = "Somme des valeurs saisies pour chaque unité.";
  } else if (incomeValue && costValue) {
    // Le revenu reflète le marché actuel ; le prix d'achat ancre l'estimation.
    suggested = roundValue(m(incomeValue.amount * 0.7 + costValue.amount * 0.3, c));
    method = `Revenu annuel capitalisé à ${y / 10} % (70 %) et prix d'achat (30 %).`;
  } else if (incomeValue) {
    suggested = incomeValue;
    method = `Revenu annuel capitalisé au rendement de référence de ${y / 10} %.`;
  } else if (costValue) {
    suggested = costValue;
    method = asset.type === "VEHICLE" ? `Prix d'achat diminué de ${VEHICLE_DEPRECIATION / 10} % par an.` : "Prix d'achat, faute de revenu connu.";
  } else {
    suggested = null;
    method = "Pas assez d'informations : indiquez un prix d'achat ou un montant demandé.";
  }

  // Unités sans revenu : quote-part égale du reste, pour que la somme des unités égale le total.
  if (suggested && unitRows.some((u) => !u.value)) {
    const rest = Math.max(0, suggested.amount - unitSum);
    const empty = unitRows.filter((u) => !u.value);
    for (const u of empty) u.value = roundValue(m(rest / empty.length, c));
  }

  const spread = asset.type === "VEHICLE" ? 0.1 : incomeValue && costValue ? 0.12 : 0.2;
  const base = declared ?? suggested;
  const has = (k: Document["kind"]) => docs.some((d) => d.kind === k);
  let points = 0;
  if (current.length) points += 1;
  if (purchase) points += 1;
  if (has("TITLE_DEED")) points += 1;
  if (has("APPRAISAL")) points += 2;
  const missing = [
    !has("APPRAISAL") && "un rapport d'expertise ou un avis de valeur",
    !has("TITLE_DEED") && "le titre de propriété (surface, situation juridique)",
    !purchase && "le prix d'achat",
    !docs.some((d) => d.kind === "PHOTO") && "des photos récentes",
    !current.length && asset.type !== "VEHICLE" && "un contrat en cours (revenu réel)",
  ].filter(Boolean) as string[];

  return {
    assetId: asset.id,
    currency: c,
    yieldPermille: y,
    units: unitRows,
    incomeValue,
    costValue,
    declared,
    suggested,
    low: base ? roundValue(m(base.amount * (1 - spread), c)) : null,
    high: base ? roundValue(m(base.amount * (1 + spread), c)) : null,
    method,
    confidence: points >= 4 ? "HIGH" : points >= 2 ? "MEDIUM" : "LOW",
    missing,
  };
}

export const CONFIDENCE_LABEL = { LOW: "Fiabilité faible", MEDIUM: "Fiabilité moyenne", HIGH: "Fiabilité bonne" } as const;
