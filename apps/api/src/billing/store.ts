import type { BillingPeriod, InvoiceLine, InvoiceStatus, PaymentAttemptView, PlanId, SubscriptionStatus } from "@keyo/shared";
import type { PrismaClient } from "../generated/prisma/client.ts";

/**
 * Stockage de l'abonnement : PostgreSQL (Prisma) si DATABASE_URL, sinon mémoire (tests, poste
 * sans base). Dates de facturation en jours ISO (AAAA-MM-JJ), montants en unité mineure.
 */
export type SubRec = {
  ownerId: string;
  status: SubscriptionStatus;
  planId: PlanId | null;
  nextPlanId: PlanId | null;
  units: number;
  period: BillingPeriod;
  currency: "XOF" | "EUR";
  trialEndsAt?: string;
  periodEnd: string;
  cancelAtPeriodEnd: boolean;
  reminded: string[];
  createdAt: string;
};

export type InvoiceRec = {
  id: string;
  number: string;
  ownerId: string;
  periodStart: string;
  periodEnd: string;
  lines: InvoiceLine[];
  total: number;
  vat: number;
  currency: "XOF" | "EUR";
  status: InvoiceStatus;
  failedAttempts: number;
  issuedAt: string;
  paidAt?: string;
};

export type AttemptRec = {
  id: string;
  invoiceId: string;
  ownerId: string;
  method: PaymentAttemptView["method"];
  accountId: string;
  amount: number;
  currency: "XOF" | "EUR";
  status: PaymentAttemptView["status"];
  providerRef?: string;
  failureReason?: string;
  createdAt: string;
  expiresAt?: string;
  settledAt?: string;
};

export type UsageRec = {
  ownerId: string;
  at: string;
  kind: string;
  tier: string;
  model: string;
  inputTokens: number;
  cacheWrite: number;
  cacheRead: number;
  outputTokens: number;
  webSearches: number;
  costMicroUsd: number;
  expert: boolean;
  extraBilled: boolean;
  billedInvoiceId?: string;
};

export interface BillingStore {
  getSub(ownerId: string): Promise<SubRec | undefined>;
  putSub(s: SubRec): Promise<void>;
  allSubs(): Promise<SubRec[]>;
  invoices(ownerId: string): Promise<InvoiceRec[]>;
  getInvoice(id: string): Promise<InvoiceRec | undefined>;
  putInvoice(i: InvoiceRec): Promise<void>;
  /** Numéro de reçu suivant pour l'année (KEYO-2026-000001). */
  nextInvoiceNumber(year: number): Promise<string>;
  attempts(invoiceId: string): Promise<AttemptRec[]>;
  getAttempt(id: string): Promise<AttemptRec | undefined>;
  attemptByRef(providerRef: string): Promise<AttemptRec | undefined>;
  putAttempt(a: AttemptRec): Promise<void>;
  pendingAttempts(ownerId?: string): Promise<AttemptRec[]>;
  addUsage(u: UsageRec): Promise<void>;
  usageSince(ownerId: string, sinceIso: string): Promise<UsageRec[]>;
  /** Analyses d'expert supplémentaires acceptées et pas encore facturées. */
  unbilledExtras(ownerId: string): Promise<number>;
  markExtrasBilled(ownerId: string, invoiceId: string): Promise<void>;
}

const pad = (n: number) => String(n).padStart(6, "0");

export class MemoryBillingStore implements BillingStore {
  private subs = new Map<string, SubRec>();
  private inv = new Map<string, InvoiceRec>();
  private att = new Map<string, AttemptRec>();
  private usage: UsageRec[] = [];
  private seq = new Map<number, number>();

  async getSub(o: string) {
    const s = this.subs.get(o);
    return s && structuredClone(s);
  }
  async putSub(s: SubRec) {
    this.subs.set(s.ownerId, structuredClone(s));
  }
  async allSubs() {
    return [...this.subs.values()].map((s) => structuredClone(s));
  }
  async invoices(o: string) {
    return [...this.inv.values()].filter((i) => i.ownerId === o).sort((a, b) => b.issuedAt.localeCompare(a.issuedAt)).map((i) => structuredClone(i));
  }
  async getInvoice(id: string) {
    const i = this.inv.get(id);
    return i && structuredClone(i);
  }
  async putInvoice(i: InvoiceRec) {
    this.inv.set(i.id, structuredClone(i));
  }
  async nextInvoiceNumber(year: number) {
    const n = (this.seq.get(year) ?? 0) + 1;
    this.seq.set(year, n);
    return `KEYO-${year}-${pad(n)}`;
  }
  async attempts(invoiceId: string) {
    return [...this.att.values()].filter((a) => a.invoiceId === invoiceId).map((a) => structuredClone(a));
  }
  async getAttempt(id: string) {
    const a = this.att.get(id);
    return a && structuredClone(a);
  }
  async attemptByRef(ref: string) {
    const a = [...this.att.values()].find((x) => x.providerRef === ref);
    return a && structuredClone(a);
  }
  async putAttempt(a: AttemptRec) {
    this.att.set(a.id, structuredClone(a));
  }
  async pendingAttempts(o?: string) {
    return [...this.att.values()].filter((a) => a.status === "PENDING" && (!o || a.ownerId === o)).map((a) => structuredClone(a));
  }
  async addUsage(u: UsageRec) {
    this.usage.push({ ...u });
  }
  async usageSince(o: string, since: string) {
    return this.usage.filter((u) => u.ownerId === o && u.at >= since);
  }
  async unbilledExtras(o: string) {
    return this.usage.filter((u) => u.ownerId === o && u.extraBilled && !u.billedInvoiceId).length;
  }
  async markExtrasBilled(o: string, invoiceId: string) {
    for (const u of this.usage) if (u.ownerId === o && u.extraBilled && !u.billedInvoiceId) u.billedInvoiceId = invoiceId;
  }
}

// ── PostgreSQL ────────────────────────────────────────────────────────────────

const day = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : undefined);
const date = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`);

type DbSub = Awaited<ReturnType<PrismaClient["subscription"]["findUnique"]>> & {};
type DbInvoice = Awaited<ReturnType<PrismaClient["invoice"]["findUnique"]>> & {};
type DbAttempt = Awaited<ReturnType<PrismaClient["paymentAttempt"]["findUnique"]>> & {};

const subOf = (s: DbSub): SubRec => ({
  ownerId: s.ownerId,
  status: s.status,
  planId: s.planId,
  nextPlanId: s.nextPlanId,
  units: s.units,
  period: s.period,
  currency: s.currency as SubRec["currency"],
  trialEndsAt: day(s.trialEndsAt),
  periodEnd: day(s.periodEnd)!,
  cancelAtPeriodEnd: s.cancelAtPeriodEnd,
  reminded: s.reminded,
  createdAt: s.createdAt.toISOString(),
});
const invoiceOf = (i: DbInvoice): InvoiceRec => ({
  id: i.id,
  number: i.number,
  ownerId: i.ownerId,
  periodStart: day(i.periodStart)!,
  periodEnd: day(i.periodEnd)!,
  lines: i.lines as InvoiceLine[],
  total: i.total,
  vat: i.vat,
  currency: i.currency as InvoiceRec["currency"],
  status: i.status,
  failedAttempts: i.failedAttempts,
  issuedAt: i.issuedAt.toISOString(),
  paidAt: i.paidAt?.toISOString(),
});
const attemptOf = (a: DbAttempt): AttemptRec => ({
  id: a.id,
  invoiceId: a.invoiceId,
  ownerId: a.ownerId,
  method: a.method,
  accountId: a.accountId,
  amount: a.amount,
  currency: a.currency as AttemptRec["currency"],
  status: a.status,
  providerRef: a.providerRef ?? undefined,
  failureReason: a.failureReason ?? undefined,
  createdAt: a.createdAt.toISOString(),
  expiresAt: a.expiresAt?.toISOString(),
  settledAt: a.settledAt?.toISOString(),
});

export class PrismaBillingStore implements BillingStore {
  constructor(private readonly db: PrismaClient) {}

  async getSub(o: string) {
    const s = await this.db.subscription.findUnique({ where: { ownerId: o } });
    return s ? subOf(s) : undefined;
  }
  async putSub(s: SubRec) {
    const data = {
      status: s.status,
      planId: s.planId,
      nextPlanId: s.nextPlanId,
      units: s.units,
      period: s.period,
      currency: s.currency,
      trialEndsAt: s.trialEndsAt ? date(s.trialEndsAt) : null,
      periodEnd: date(s.periodEnd),
      cancelAtPeriodEnd: s.cancelAtPeriodEnd,
      reminded: s.reminded,
    };
    await this.db.subscription.upsert({ where: { ownerId: s.ownerId }, create: { ownerId: s.ownerId, ...data }, update: data });
  }
  async allSubs() {
    return (await this.db.subscription.findMany({ where: { status: { not: "CANCELED" } } })).map(subOf);
  }
  async invoices(o: string) {
    return (await this.db.invoice.findMany({ where: { ownerId: o }, orderBy: { issuedAt: "desc" } })).map(invoiceOf);
  }
  async getInvoice(id: string) {
    const i = await this.db.invoice.findUnique({ where: { id } });
    return i ? invoiceOf(i) : undefined;
  }
  async putInvoice(i: InvoiceRec) {
    const data = {
      number: i.number,
      ownerId: i.ownerId,
      periodStart: date(i.periodStart),
      periodEnd: date(i.periodEnd),
      lines: i.lines,
      total: i.total,
      vat: i.vat,
      currency: i.currency,
      status: i.status,
      failedAttempts: i.failedAttempts,
      issuedAt: new Date(i.issuedAt),
      paidAt: i.paidAt ? new Date(i.paidAt) : null,
    };
    await this.db.invoice.upsert({ where: { id: i.id }, create: { id: i.id, ...data }, update: data });
  }
  async nextInvoiceNumber(year: number) {
    const n = await this.db.invoice.count({ where: { number: { startsWith: `KEYO-${year}-` } } });
    return `KEYO-${year}-${pad(n + 1)}`;
  }
  async attempts(invoiceId: string) {
    return (await this.db.paymentAttempt.findMany({ where: { invoiceId }, orderBy: { createdAt: "asc" } })).map(attemptOf);
  }
  async getAttempt(id: string) {
    const a = await this.db.paymentAttempt.findUnique({ where: { id } });
    return a ? attemptOf(a) : undefined;
  }
  async attemptByRef(ref: string) {
    const a = await this.db.paymentAttempt.findUnique({ where: { providerRef: ref } });
    return a ? attemptOf(a) : undefined;
  }
  async putAttempt(a: AttemptRec) {
    const data = {
      invoiceId: a.invoiceId,
      ownerId: a.ownerId,
      method: a.method,
      accountId: a.accountId,
      amount: a.amount,
      currency: a.currency,
      status: a.status,
      providerRef: a.providerRef ?? null,
      failureReason: a.failureReason ?? null,
      createdAt: new Date(a.createdAt),
      expiresAt: a.expiresAt ? new Date(a.expiresAt) : null,
      settledAt: a.settledAt ? new Date(a.settledAt) : null,
    };
    await this.db.paymentAttempt.upsert({ where: { id: a.id }, create: { id: a.id, ...data }, update: data });
  }
  async pendingAttempts(o?: string) {
    return (await this.db.paymentAttempt.findMany({ where: { status: "PENDING", ...(o ? { ownerId: o } : {}) } })).map(attemptOf);
  }
  async addUsage(u: UsageRec) {
    await this.db.usageRecord.create({ data: { ...u, at: new Date(u.at) } });
  }
  async usageSince(o: string, since: string) {
    return (await this.db.usageRecord.findMany({ where: { ownerId: o, at: { gte: new Date(since) } } })).map((u) => ({ ...u, at: u.at.toISOString(), billedInvoiceId: u.billedInvoiceId ?? undefined }));
  }
  async unbilledExtras(o: string) {
    return this.db.usageRecord.count({ where: { ownerId: o, extraBilled: true, billedInvoiceId: null } });
  }
  async markExtrasBilled(o: string, invoiceId: string) {
    await this.db.usageRecord.updateMany({ where: { ownerId: o, extraBilled: true, billedInvoiceId: null }, data: { billedInvoiceId: invoiceId } });
  }
}
