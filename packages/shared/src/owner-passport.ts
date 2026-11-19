import type { Agreement, Asset, AssetShare, AssetUnit, ScheduleItem, Transaction } from "./domain.ts";
import type { Currency, Money } from "./money.ts";
import { holderPatrimony } from "./patrimony.ts";

/**
 * Passeport propriétaire : profil financier tiré de la gestion dans Keyo, pour une banque ou une
 * microfinance. Seuls les loyers confirmés par l'opérateur de paiement (webhook) sont « certifiés » ;
 * ce que le propriétaire déclare (autres revenus, crédits en cours) reste « déclaré ».
 * La capacité d'emprunt est une simulation indicative : la décision appartient à l'établissement.
 */
export type OwnerPassportInput = {
  ownerId: string;
  currency: Currency;
  assets: Asset[];
  units: AssetUnit[];
  agreements: Agreement[];
  schedule: ScheduleItem[];
  transactions: Transaction[];
  shares: AssetShare[];
  /** Score du contrôle de gestion (0 à 100). */
  auditScore: number;
  today: string;
};

export type PassportLevel = "EXCELLENT" | "VERY_GOOD" | "GOOD" | "FAIR" | "BUILDING";
export const PASSPORT_LEVEL_LABEL: Record<PassportLevel, string> = {
  EXCELLENT: "Excellent",
  VERY_GOOD: "Très bon",
  GOOD: "Bon",
  FAIR: "À consolider",
  BUILDING: "En construction",
};

export type OwnerPassport = {
  currency: Currency;
  score: number;
  level: PassportLevel;
  /** Points par critère, pour expliquer le score. */
  parts: { key: "COLLECTION" | "OCCUPANCY" | "TRACK_RECORD" | "COMPLIANCE" | "DIVERSITY"; label: string; points: number; max: number; detail: string }[];
  /** Loyers encaissés et certifiés sur les 12 derniers mois. */
  certifiedIncome12m: Money;
  monthlyCertifiedIncome: Money;
  /** Loyers attendus sur la même période (échéances passées). */
  expected12m: Money;
  collectionRatePermille: number;
  /** Loyers des contrats en cours, par mois. */
  currentMonthlyRent: Money;
  expenses12m: Money;
  monthlyNet: Money;
  occupiedUnits: number;
  totalUnits: number;
  assetCount: number;
  /** Mois depuis la première échéance gérée avec Keyo. */
  monthsOnKeyo: number;
  patrimony: Money;
  /** Biens dans une autre devise, non comptés. */
  otherCurrencyAssets: number;
};

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const m = (amount: number, currency: Currency): Money => ({ amount: Math.round(amount), currency });
const shiftYear = (iso: string, years: number) => `${Number(iso.slice(0, 4)) + years}${iso.slice(4, 10)}`;
const monthsBetween = (a: string, b: string) => (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 + Number(b.slice(5, 7)) - Number(a.slice(5, 7));

export function ownerPassport(input: OwnerPassportInput): OwnerPassport {
  const { currency: c, today } = input;
  const assets = input.assets.filter((a) => a.currency === c);
  const ids = new Set(assets.map((a) => a.id));
  const from = shiftYear(today, -1);
  const agreementAsset = new Map(input.agreements.map((g) => [g.id, g.assetId]));

  const rentTx = input.transactions.filter((t) => ids.has(t.assetId) && t.direction === "IN" && t.confirmedBy === "WEBHOOK" && t.amount.currency === c && t.occurredAt.slice(0, 10) > from && t.occurredAt.slice(0, 10) <= today);
  const certified = rentTx.reduce((n, t) => n + t.amount.amount, 0);
  const due = input.schedule.filter((it) => ids.has(agreementAsset.get(it.agreementId) ?? "") && it.dueDate > from && it.dueDate <= today && it.expected.currency === c);
  const expected = due.reduce((n, it) => n + it.expected.amount, 0);
  const received = due.reduce((n, it) => n + Math.min(it.received.amount, it.expected.amount), 0);
  const collection = expected ? Math.round((received * 1000) / expected) : 0;
  const late = due.filter((it) => it.status === "LATE" || it.status === "UNPAID" || it.status === "PARTIAL").length;

  const expenses = input.transactions
    .filter((t) => ids.has(t.assetId) && t.direction === "OUT" && t.amount.currency === c && t.occurredAt.slice(0, 10) > from && t.occurredAt.slice(0, 10) <= today)
    .reduce((n, t) => n + t.amount.amount, 0);

  const current = input.agreements.filter((g) => ids.has(g.assetId) && g.startDate <= today && (!g.endDate || g.endDate >= today));
  const monthlyRent = current.reduce((n, g) => n + g.periodicAmount.amount, 0);
  const units = input.units.filter((u) => ids.has(u.assetId));
  const occupied = new Set(current.map((g) => g.unitId)).size;

  const firstDue = input.schedule.filter((it) => ids.has(agreementAsset.get(it.agreementId) ?? "") && it.dueDate <= today).map((it) => it.dueDate).sort()[0];
  const months = firstDue ? Math.max(0, monthsBetween(firstDue, today)) : 0;
  const patrimony = holderPatrimony(assets, input.shares, input.ownerId).totals.find((t) => t.currency === c) ?? m(0, c);

  // Score sur 1000 : ce qu'un banquier regarde d'abord, la régularité des encaissements.
  const occ = units.length ? occupied / units.length : 0;
  const parts: OwnerPassport["parts"] = [
    {
      key: "COLLECTION",
      label: "Encaissement",
      max: 400,
      points: expected ? Math.round(400 * clamp((collection - 600) / 400, 0, 1)) : 0,
      detail: expected ? `${(collection / 10).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} % des loyers encaissés sur 12 mois${late ? `, ${late} échéance${late > 1 ? "s" : ""} en souffrance` : ""}` : "Aucun loyer encaissé avec Keyo pour l'instant",
    },
    { key: "OCCUPANCY", label: "Occupation", max: 200, points: Math.round(200 * occ), detail: units.length ? `${occupied} sur ${units.length} occupé${occupied > 1 ? "s" : ""}` : "Aucune unité" },
    { key: "TRACK_RECORD", label: "Ancienneté avec Keyo", max: 150, points: Math.round(150 * clamp(months / 24, 0, 1)), detail: months ? `${months} mois d'historique` : "Historique en cours de constitution" },
    { key: "COMPLIANCE", label: "Dossier en ordre", max: 150, points: Math.round(1.5 * clamp(input.auditScore, 0, 100)), detail: `Contrôle de gestion ${input.auditScore}/100` },
    { key: "DIVERSITY", label: "Diversification", max: 100, points: Math.round(100 * clamp((units.length - 1) / 5, 0, 1)), detail: `${assets.length} bien${assets.length > 1 ? "s" : ""}, ${units.length} unité${units.length > 1 ? "s" : ""}` },
  ];
  const score = parts.reduce((n, p) => n + p.points, 0);
  const level: PassportLevel = score >= 850 ? "EXCELLENT" : score >= 700 ? "VERY_GOOD" : score >= 550 ? "GOOD" : score >= 400 ? "FAIR" : "BUILDING";

  const span = Math.max(1, Math.min(12, months || 12));
  return {
    currency: c,
    score,
    level,
    parts,
    certifiedIncome12m: m(certified, c),
    monthlyCertifiedIncome: m(certified / span, c),
    expected12m: m(expected, c),
    collectionRatePermille: collection,
    currentMonthlyRent: m(monthlyRent, c),
    expenses12m: m(expenses, c),
    monthlyNet: m((certified - expenses) / span, c),
    occupiedUnits: occupied,
    totalUnits: units.length,
    assetCount: assets.length,
    monthsOnKeyo: months,
    patrimony,
    otherCurrencyAssets: input.assets.length - assets.length,
  };
}

export type BorrowingInput = {
  passport: OwnerPassport;
  /** Autres revenus nets mensuels déclarés (salaire, pension…), unité mineure. */
  otherIncome: number;
  /** Mensualités des crédits en cours, déclarées. */
  existingLoans: number;
  years: number;
  /** Taux annuel en pour mille ; par défaut le repère du marché de la devise. */
  ratePermille?: number;
  /** Loyer attendu du bien à financer (compté comme les autres loyers). */
  projectRent?: number;
};

export type Borrowing = {
  /** Revenus retenus : autres revenus + part des loyers retenue par la banque. */
  retainedIncome: Money;
  rentRetainedPermille: number;
  maxDebtPermille: number;
  ratePermille: number;
  /** Mensualité maximale pour un nouveau crédit. */
  maxInstallment: Money;
  /** Montant empruntable indicatif. */
  capacity: Money;
  /** Taux d'endettement actuel (crédits en cours / revenus retenus). */
  currentDebtPermille: number;
  years: number;
};

/** Repères de marché, indicatifs : taux du crédit immobilier et endettement maximal. */
const MARKET: Record<Currency, { rate: number; maxDebt: number }> = {
  XOF: { rate: 85, maxDebt: 330 },
  EUR: { rate: 35, maxDebt: 350 },
  CAD: { rate: 50, maxDebt: 390 },
  USD: { rate: 65, maxDebt: 360 },
};
/** Les banques ne retiennent en général que 70 % des loyers (vacance, impayés, charges). */
const RENT_RETAINED = 700;

export function borrowingCapacity({ passport: p, otherIncome, existingLoans, years, ratePermille, projectRent = 0 }: BorrowingInput): Borrowing {
  const c = p.currency;
  const market = MARKET[c];
  const rate = ratePermille ?? market.rate;
  // On retient le plus prudent entre les loyers en cours et les loyers réellement encaissés.
  const rents = Math.min(p.currentMonthlyRent.amount, p.monthlyCertifiedIncome.amount || p.currentMonthlyRent.amount) + projectRent;
  const retained = otherIncome + (rents * RENT_RETAINED) / 1000;
  const maxInstallment = Math.max(0, (retained * market.maxDebt) / 1000 - existingLoans);
  const r = rate / 1000 / 12;
  const n = years * 12;
  const capacity = r > 0 ? (maxInstallment * (1 - (1 + r) ** -n)) / r : maxInstallment * n;
  // Arrondi bas à trois chiffres significatifs : on ne promet pas plus que le calcul.
  const floor3 = (x: number) => {
    if (x < 1000) return Math.floor(x);
    const step = 10 ** (String(Math.floor(x)).length - 3);
    return Math.floor(x / step) * step;
  };
  return {
    retainedIncome: m(retained, c),
    rentRetainedPermille: RENT_RETAINED,
    maxDebtPermille: market.maxDebt,
    ratePermille: rate,
    maxInstallment: m(floor3(maxInstallment), c),
    capacity: m(floor3(capacity), c),
    currentDebtPermille: retained > 0 ? Math.round((existingLoans * 1000) / retained) : 0,
    years,
  };
}
