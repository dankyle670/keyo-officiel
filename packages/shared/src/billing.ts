import type { Asset, AssetUnit } from "./domain.ts";
import type { Currency, Money } from "./money.ts";

/**
 * Abonnement Keyo : un prix fixe par mois selon le nombre de logements gérés, jamais un
 * pourcentage des loyers. Source de vérité des formules, prix, TVA, quotas et relances,
 * partagée par l'API (facturation) et l'app (affichage). Prix TTC.
 */
export const PLAN_IDS = ["ESSENTIEL", "CONFORT", "PATRIMOINE"] as const;
export type PlanId = (typeof PLAN_IDS)[number];
export type BillingPeriod = "MONTHLY" | "YEARLY";
export type BillingCurrency = Extract<Currency, "XOF" | "EUR">;

export type Plan = {
  id: PlanId;
  name: string;
  minUnits: number;
  maxUnits: number;
  /** Prix mensuel TTC, en unité mineure, par devise. */
  monthly: Record<BillingCurrency, number>;
  /** Analyses d'expert comprises chaque mois (expertise, contrat, fiscalité, patrimoine). */
  expertIncluded: number;
};

export const PLANS: Plan[] = [
  { id: "ESSENTIEL", name: "Essentiel", minUnits: 1, maxUnits: 2, monthly: { XOF: 7_500, EUR: 1_150 }, expertIncluded: 3 },
  { id: "CONFORT", name: "Confort", minUnits: 3, maxUnits: 6, monthly: { XOF: 19_900, EUR: 2_990 }, expertIncluded: 10 },
  { id: "PATRIMOINE", name: "Patrimoine", minUnits: 7, maxUnits: 15, monthly: { XOF: 39_900, EUR: 5_990 }, expertIncluded: 25 },
];
/** Au-delà de la dernière formule : sur devis. */
export const CUSTOM_FROM_UNITS = 16;
export const TRIAL_DAYS = 30;
/** Paiement annuel : 2 mois offerts. */
export const YEARLY_MONTHS_BILLED = 10;
/** Analyse d'expert au-delà du quota, ajoutée à la facture suivante. */
export const EXTRA_EXPERT_PRICE: Record<BillingCurrency, number> = { XOF: 1_000, EUR: 150 };
/** TVA comprise dans les prix : Côte d'Ivoire 18 %, France 20 %. */
export const VAT_RATE: Record<BillingCurrency, number> = { XOF: 0.18, EUR: 0.2 };
/** Commission habituelle d'une agence de gestion locative, pour la comparaison affichée. */
export const AGENCY_RATE = 0.1;

/**
 * Logements gérés, base du prix : chaque logement ou local d'un bien immobilier (au moins un par
 * bien), et un par bien pour les autres types (une plantation compte pour un, quelles que soient ses parcelles).
 */
export function managedUnits(assets: Asset[], units: AssetUnit[]): number {
  return assets.reduce((n, a) => n + (a.type === "REAL_ESTATE" ? Math.max(1, units.filter((u) => u.assetId === a.id).length) : 1), 0);
}

export const planById = (id: PlanId) => PLANS.find((p) => p.id === id)!;

/** Formule correspondant au nombre de logements ; null au-delà (sur devis). Zéro logement : Essentiel. */
export function planFor(units: number): Plan | null {
  if (units >= CUSTOM_FROM_UNITS) return null;
  return PLANS.find((p) => units <= p.maxUnits) ?? PLANS[0]!;
}

export function planPrice(plan: Plan, period: BillingPeriod, currency: BillingCurrency): Money {
  const m = plan.monthly[currency];
  return { amount: period === "YEARLY" ? m * YEARLY_MONTHS_BILLED : m, currency };
}

/** Part de TVA comprise dans un montant TTC (arrondie à l'unité mineure). */
export function vatIncluded(amount: number, currency: BillingCurrency): number {
  return amount - Math.round(amount / (1 + VAT_RATE[currency]));
}

/** Ce qu'une agence prendrait chaque mois sur ces loyers, et l'économie avec Keyo. */
export function agencySavings(monthlyRents: number, keyoMonthly: number) {
  const agency = Math.round(monthlyRents * AGENCY_RATE);
  return { agency, keyo: keyoMonthly, saved: Math.max(0, agency - keyoMonthly) };
}

// ── Dates (ISO, jour UTC) ────────────────────────────────────────────────────

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Même jour le mois suivant (ou l'année suivante), ramené au dernier jour si besoin (31 janv. → 28 févr.). */
export function addPeriod(iso: string, period: BillingPeriod): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number) as [number, number, number];
  const months = period === "YEARLY" ? 12 : 1;
  const ty = y + Math.floor((m - 1 + months) / 12);
  const tm = ((m - 1 + months) % 12) + 1;
  const last = new Date(Date.UTC(ty, tm, 0)).getUTCDate();
  return `${ty}-${String(tm).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
}

const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to.slice(0, 10)}T00:00:00Z`) - Date.parse(`${from.slice(0, 10)}T00:00:00Z`)) / 86_400_000);

// ── Cycle de l'abonnement ────────────────────────────────────────────────────

export const SUBSCRIPTION_STATUSES = ["TRIALING", "ACTIVE", "PAST_DUE", "READ_ONLY", "CANCELED"] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];
export const SUBSCRIPTION_STATUS_LABEL: Record<SubscriptionStatus, string> = {
  TRIALING: "Essai gratuit",
  ACTIVE: "Actif",
  PAST_DUE: "Paiement en retard",
  READ_ONLY: "Lecture seule",
  CANCELED: "Résilié",
};

/**
 * Lecture seule : le propriétaire voit tout, mais l'agent ne fait plus d'action pour lui.
 * Les loyers de ses locataires continuent d'arriver sur son compte : on ne bloque jamais son argent.
 */
export const agentActionsAllowed = (s: SubscriptionStatus) => s === "TRIALING" || s === "ACTIVE" || s === "PAST_DUE";

/** Nouvelles tentatives après un échec, en jours après l'échéance ; ensuite, lecture seule. */
export const RETRY_DAYS = [3, 7] as const;
/** Rappels avant la fin de l'essai, en jours. */
export const TRIAL_REMINDER_DAYS = [7, 1] as const;

export type BillingState = {
  status: SubscriptionStatus;
  trialEndsAt?: string;
  /** Prochaine échéance (fin de la période payée, ou fin de l'essai). */
  periodEnd: string;
  cancelAtPeriodEnd: boolean;
  hasPaymentMethod: boolean;
  /** Échéance impayée en cours : date d'échéance et nombre de tentatives échouées. */
  unpaid?: { dueDate: string; failedAttempts: number };
  /** Paiement en cours chez le prestataire (attente du webhook ou de la validation Mobile Money). */
  pendingPayment: boolean;
  /** Rappels déjà envoyés (clés). */
  reminded: string[];
};

export type BillingAction =
  | { kind: "REMIND_TRIAL"; daysLeft: number; key: string }
  | { kind: "CHARGE" }
  | { kind: "RETRY"; attempt: number }
  | { kind: "LOCK" }
  | { kind: "CANCEL" };

/**
 * Prochaine chose à faire pour un abonnement, à une date donnée. Pure et testée : la tâche
 * planifiée de l'API l'appelle chaque heure pour chaque abonnement.
 */
export function nextBillingAction(s: BillingState, today: string): BillingAction | null {
  if (s.status === "CANCELED" || s.pendingPayment) return null;
  if (s.cancelAtPeriodEnd && today >= s.periodEnd) return { kind: "CANCEL" };

  if (s.status === "TRIALING") {
    if (today >= s.periodEnd) return { kind: "CHARGE" };
    const left = daysBetween(today, s.periodEnd);
    for (const d of TRIAL_REMINDER_DAYS) {
      const key = `trial-${d}`;
      if (left <= d && !s.reminded.includes(key) && !s.hasPaymentMethod) return { kind: "REMIND_TRIAL", daysLeft: left, key };
    }
    return null;
  }

  if (s.unpaid) {
    const late = daysBetween(s.unpaid.dueDate, today);
    const n = s.unpaid.failedAttempts;
    if (n > RETRY_DAYS.length) return s.status === "READ_ONLY" ? null : { kind: "LOCK" };
    if (n >= 1 && late >= RETRY_DAYS[n - 1]!) return s.hasPaymentMethod ? { kind: "RETRY", attempt: n + 1 } : n === RETRY_DAYS.length ? { kind: "LOCK" } : null;
    if (n === 0 && s.hasPaymentMethod) return { kind: "CHARGE" };
    // Sans moyen de paiement : lecture seule après le dernier délai.
    if (!s.hasPaymentMethod && late >= RETRY_DAYS[RETRY_DAYS.length - 1]!) return s.status === "READ_ONLY" ? null : { kind: "LOCK" };
    return null;
  }

  if (today >= s.periodEnd) return { kind: "CHARGE" };
  return null;
}

/** Formule appliquée à la prochaine échéance quand le nombre de logements change. */
export function planChange(current: PlanId, units: number): { next: PlanId | null; direction: "UP" | "DOWN" | "CUSTOM" } | null {
  const p = planFor(units);
  if (!p) return { next: null, direction: "CUSTOM" };
  if (p.id === current) return null;
  return { next: p.id, direction: PLAN_IDS.indexOf(p.id) > PLAN_IDS.indexOf(current) ? "UP" : "DOWN" };
}

/** Analyses d'expert restantes ce mois-ci. */
export function expertRemaining(plan: Plan, usedThisMonth: number) {
  return Math.max(0, plan.expertIncluded - usedThisMonth);
}

// ── Vues partagées API / app ─────────────────────────────────────────────────

export type InvoiceLine = { label: string; amount: number };
export type InvoiceStatus = "OPEN" | "PAID" | "FAILED" | "VOID";
export const INVOICE_STATUS_LABEL: Record<InvoiceStatus, string> = { OPEN: "En attente", PAID: "Payée", FAILED: "Échec", VOID: "Annulée" };

export type InvoiceView = {
  id: string;
  number: string;
  issuedAt: string;
  periodStart: string;
  periodEnd: string;
  lines: InvoiceLine[];
  total: Money;
  vat: Money;
  status: InvoiceStatus;
  paidAt?: string;
  failedAttempts: number;
};

export type PaymentAttemptView = {
  id: string;
  invoiceId: string;
  method: "CARD" | "MOBILE_MONEY";
  status: "PENDING" | "SUCCEEDED" | "FAILED" | "EXPIRED";
  /** Mobile Money : à valider par le propriétaire sur son téléphone. */
  needsOwnerApproval: boolean;
  amount: Money;
  createdAt: string;
  failureReason?: string;
};

export type SubscriptionView = {
  status: SubscriptionStatus;
  plan: Plan | null;
  /** Formule appliquée à la prochaine échéance, si le nombre de logements a changé. */
  nextPlan?: Plan | null;
  units: number;
  period: BillingPeriod;
  currency: BillingCurrency;
  price: Money | null;
  trialEndsAt?: string;
  periodEnd: string;
  cancelAtPeriodEnd: boolean;
  expert: { included: number; used: number; remaining: number; extraPrice: Money };
  agentActions: boolean;
  pendingAttempt?: PaymentAttemptView;
  /** Échéance impayée. */
  unpaid?: InvoiceView;
  /** Comparaison avec une agence à 10 %, sur les loyers en cours. */
  savings?: { monthlyRents: Money; agency: Money; saved: Money };
  /** Sur devis (plus de 15 logements) : DK Group prend contact. */
  custom: boolean;
};
