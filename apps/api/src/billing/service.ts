import { randomUUID } from "node:crypto";
import { Logger } from "@nestjs/common";
import {
  addDays,
  addPeriod,
  agencySavings,
  agentActionsAllowed,
  EXTRA_EXPERT_PRICE,
  managedUnits,
  nextBillingAction,
  planById,
  planChange,
  planFor,
  planPrice,
  TRIAL_DAYS,
  vatIncluded,
  type BillingPeriod,
  type BillingState,
  type InvoiceLine,
  type InvoiceView,
  type PaymentAccountView,
  type PaymentAttemptView,
  type SubscriptionView,
} from "@keyo/shared";
import type { OwnerSnapshot } from "../autonomous/store.ts";
import type { BillingProvider, WebhookEvent } from "./provider.ts";
import type { AttemptRec, BillingStore, InvoiceRec, SubRec, UsageRec } from "./store.ts";
import { receiptPdf } from "./receipt.ts";

export class BillingError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

/** Délai pour valider une demande de paiement Mobile Money sur le téléphone. */
const MOBILE_MONEY_TTL_MIN = 15;
const PERIOD_LABEL: Record<BillingPeriod, string> = { MONTHLY: "mensuel", YEARLY: "annuel" };

export type BillingDeps = {
  store: BillingStore;
  provider: BillingProvider;
  /** Données envoyées par l'app (logements, loyers, nom). */
  snapshot: (ownerId: string) => OwnerSnapshot | undefined;
  /** Comptes de paiement du propriétaire (vues masquées). */
  accounts: (ownerId: string) => Promise<PaymentAccountView[]>;
  /** Avis au propriétaire (SMS ou notification ; consigné pour l'instant). */
  notify?: (ownerId: string, message: string) => void;
  now?: () => Date;
};

/**
 * Abonnement Keyo : essai, échéances, prélèvement (carte) ou demande de paiement (Mobile Money),
 * relances, lecture seule, résiliation. Les règles viennent de packages/shared/src/billing.ts ;
 * ce service applique leurs décisions et ne marque une échéance payée que sur webhook.
 */
export class BillingService {
  private readonly log = new Logger("Abonnement");
  private readonly now: () => Date;
  constructor(private readonly d: BillingDeps) {
    this.now = d.now ?? (() => new Date());
  }
  private today = () => this.now().toISOString().slice(0, 10);
  private notify(o: string, m: string) {
    this.log.log(`Avis à ${o} : ${m}`);
    this.d.notify?.(o, m);
  }

  /** Abonnement du propriétaire, créé en essai gratuit à la première visite. Suit le nombre de logements. */
  async ensure(ownerId: string): Promise<SubRec> {
    const snap = this.d.snapshot(ownerId);
    const units = snap ? managedUnits(snap.assets, snap.units) : 0;
    let s = await this.d.store.getSub(ownerId);
    if (!s) {
      const trialEnd = addDays(this.today(), TRIAL_DAYS);
      s = {
        ownerId,
        status: "TRIALING",
        planId: planFor(units)?.id ?? null,
        nextPlanId: null,
        units,
        period: "MONTHLY",
        currency: snap?.currency === "EUR" ? "EUR" : "XOF",
        trialEndsAt: trialEnd,
        periodEnd: trialEnd,
        cancelAtPeriodEnd: false,
        reminded: [],
        createdAt: this.now().toISOString(),
      };
      await this.d.store.putSub(s);
      return s;
    }
    if (snap && units !== s.units) {
      s.units = units;
      if (s.status === "TRIALING") {
        // Pendant l'essai, la formule suit simplement le nombre de logements.
        s.planId = planFor(units)?.id ?? null;
        s.nextPlanId = null;
      } else {
        const ch = s.planId ? planChange(s.planId, units) : { next: planFor(units)?.id ?? null, direction: "UP" as const };
        s.nextPlanId = ch ? ch.next : null;
        if (ch && ch.direction === "UP") this.notify(ownerId, `Vous gérez maintenant ${units} logements : à la prochaine échéance, votre formule passe à ${ch.next ? planById(ch.next).name : "un tarif sur devis"}.`);
      }
      await this.d.store.putSub(s);
    }
    return s;
  }

  private async state(s: SubRec): Promise<BillingState> {
    const unpaid = (await this.d.store.invoices(s.ownerId)).find((i) => i.status === "OPEN" || i.status === "FAILED");
    return {
      status: s.status,
      trialEndsAt: s.trialEndsAt,
      periodEnd: s.periodEnd,
      cancelAtPeriodEnd: s.cancelAtPeriodEnd,
      hasPaymentMethod: Boolean(await this.method(s.ownerId)),
      unpaid: unpaid ? { dueDate: unpaid.periodStart, failedAttempts: unpaid.failedAttempts } : undefined,
      pendingPayment: (await this.d.store.pendingAttempts(s.ownerId)).length > 0,
      reminded: s.reminded,
    };
  }

  /** Moyen de paiement de l'abonnement : carte, ou compte Mobile Money vérifié par code. */
  private async method(ownerId: string) {
    return (await this.d.accounts(ownerId)).find((a) => a.purpose === "SUBSCRIPTION" && a.status === "VERIFIED" && (a.kind === "CARD" || a.kind === "MOBILE_MONEY"));
  }

  async view(ownerId: string): Promise<SubscriptionView> {
    const s = await this.ensure(ownerId);
    const plan = s.planId ? planById(s.planId) : null;
    const usage = await this.d.store.usageSince(ownerId, this.monthStart());
    const used = usage.filter((u) => u.expert).length;
    const pending = (await this.d.store.pendingAttempts(ownerId))[0];
    const unpaid = (await this.d.store.invoices(ownerId)).find((i) => i.status === "OPEN" || i.status === "FAILED");
    const price = plan ? planPrice(plan, s.period, s.currency) : null;
    const rents = this.monthlyRents(ownerId, s.currency);
    const monthly = plan ? plan.monthly[s.currency] : 0;
    const sv = rents && plan ? agencySavings(rents, monthly) : undefined;
    return {
      status: s.status,
      plan,
      nextPlan: s.nextPlanId ? planById(s.nextPlanId) : s.status !== "TRIALING" && plan && !planFor(s.units) ? null : undefined,
      units: s.units,
      period: s.period,
      currency: s.currency,
      price,
      trialEndsAt: s.trialEndsAt,
      periodEnd: s.periodEnd,
      cancelAtPeriodEnd: s.cancelAtPeriodEnd,
      expert: { included: plan?.expertIncluded ?? 0, used, remaining: Math.max(0, (plan?.expertIncluded ?? 0) - used), extraPrice: { amount: EXTRA_EXPERT_PRICE[s.currency], currency: s.currency } },
      agentActions: agentActionsAllowed(s.status),
      pendingAttempt: pending ? attemptView(pending) : undefined,
      unpaid: unpaid ? invoiceView(unpaid) : undefined,
      savings: sv ? { monthlyRents: { amount: rents, currency: s.currency }, agency: { amount: sv.agency, currency: s.currency }, saved: { amount: sv.saved, currency: s.currency } } : undefined,
      custom: !plan,
    };
  }

  /** Loyers mensuels des contrats en cours, dans la devise de l'abonnement (pas de conversion implicite). */
  private monthlyRents(ownerId: string, currency: string) {
    const snap = this.d.snapshot(ownerId);
    const today = this.today();
    return (snap?.agreements ?? [])
      .filter((g) => g.period === "MONTHLY" && g.periodicAmount.currency === currency && g.startDate <= today && (!g.endDate || g.endDate >= today))
      .reduce((n, g) => n + g.periodicAmount.amount, 0);
  }

  private monthStart = () => `${this.today().slice(0, 7)}-01T00:00:00.000Z`;

  async invoices(ownerId: string): Promise<InvoiceView[]> {
    return (await this.d.store.invoices(ownerId)).map(invoiceView);
  }

  async receipt(ownerId: string, invoiceId: string) {
    const inv = await this.d.store.getInvoice(invoiceId);
    if (!inv || inv.ownerId !== ownerId) throw new BillingError("Facture introuvable.", 404);
    return { pdf: receiptPdf(inv, this.d.snapshot(ownerId)?.ownerName ?? "Propriétaire Keyo"), filename: `${inv.number}.pdf` };
  }

  /** Mensuel ou annuel : appliqué à la prochaine échéance. */
  async setPeriod(ownerId: string, period: BillingPeriod) {
    const s = await this.ensure(ownerId);
    s.period = period;
    await this.d.store.putSub(s);
    return this.view(ownerId);
  }

  /** Résiliation à la fin de la période payée (ou de l'essai) ; annulable jusque-là. */
  async cancel(ownerId: string, cancel: boolean) {
    const s = await this.ensure(ownerId);
    if (s.status === "CANCELED") throw new BillingError("Abonnement déjà résilié.");
    s.cancelAtPeriodEnd = cancel;
    await this.d.store.putSub(s);
    return this.view(ownerId);
  }

  /**
   * Suppression du compte : l'abonnement s'arrête tout de suite, plus aucun prélèvement ni relance ;
   * les échéances non payées sont annulées. Les reçus déjà émis sont conservés (obligation comptable).
   */
  async closeAccount(ownerId: string) {
    const s = await this.d.store.getSub(ownerId);
    if (s) {
      s.status = "CANCELED";
      s.cancelAtPeriodEnd = true;
      s.periodEnd = this.today();
      await this.d.store.putSub(s);
    }
    for (const inv of await this.d.store.invoices(ownerId)) {
      if (inv.status === "OPEN" || inv.status === "FAILED") await this.d.store.putInvoice({ ...inv, status: "VOID" });
    }
  }

  /** Payer tout de suite l'échéance impayée (après un échec, ou en fin d'essai). */
  async payNow(ownerId: string) {
    const s = await this.ensure(ownerId);
    let inv = (await this.d.store.invoices(ownerId)).find((i) => i.status === "OPEN" || i.status === "FAILED");
    if (!inv) {
      if (s.status === "ACTIVE" || s.status === "CANCELED") throw new BillingError("Rien à payer pour l'instant.");
      // Fin d'essai anticipée : le propriétaire choisit de payer avant la date.
      inv = await this.issue(s);
    }
    if ((await this.d.store.pendingAttempts(ownerId)).length) throw new BillingError("Un paiement est déjà en cours.");
    const a = await this.attempt(s, inv);
    if (!a) throw new BillingError("Ajoutez d'abord une carte ou un compte Mobile Money vérifié.");
    return attemptView(a);
  }

  async attemptStatus(ownerId: string, attemptId: string) {
    const a = await this.d.store.getAttempt(attemptId);
    if (!a || a.ownerId !== ownerId) throw new BillingError("Paiement introuvable.", 404);
    return attemptView(a);
  }

  /** Référence du prestataire d'un paiement en cours (démonstration). */
  async providerRefOf(attemptId: string) {
    const a = await this.d.store.getAttempt(attemptId);
    if (!a?.providerRef || a.status !== "PENDING") throw new BillingError("Ce paiement n'est plus en attente.");
    return a.providerRef;
  }

  /** Facture de la période qui commence à l'échéance : formule, plus les analyses d'expert supplémentaires. */
  private async issue(s: SubRec): Promise<InvoiceRec> {
    const planId = s.nextPlanId ?? s.planId;
    const plan = planId ? planById(planId) : null;
    if (!plan) throw new BillingError("Tarif sur devis : DK Group vous contacte.");
    const start = s.periodEnd;
    const end = addPeriod(start, s.period);
    const lines: InvoiceLine[] = [{ label: `Keyo ${plan.name}, abonnement ${PERIOD_LABEL[s.period]}`, amount: planPrice(plan, s.period, s.currency).amount }];
    const extras = await this.d.store.unbilledExtras(s.ownerId);
    if (extras) lines.push({ label: `${extras} analyse${extras > 1 ? "s" : ""} d'expert supplémentaire${extras > 1 ? "s" : ""}`, amount: extras * EXTRA_EXPERT_PRICE[s.currency] });
    const total = lines.reduce((n, l) => n + l.amount, 0);
    const inv: InvoiceRec = {
      id: `inv_${randomUUID()}`,
      number: await this.d.store.nextInvoiceNumber(Number(start.slice(0, 4))),
      ownerId: s.ownerId,
      periodStart: start,
      periodEnd: end,
      lines,
      total,
      vat: vatIncluded(total, s.currency),
      currency: s.currency,
      status: "OPEN",
      failedAttempts: 0,
      issuedAt: this.now().toISOString(),
    };
    await this.d.store.putInvoice(inv);
    if (extras) await this.d.store.markExtrasBilled(s.ownerId, inv.id);
    return inv;
  }

  /** Lance un encaissement sur le moyen enregistré ; undefined sans moyen de paiement. */
  private async attempt(s: SubRec, inv: InvoiceRec): Promise<AttemptRec | undefined> {
    const m = await this.method(s.ownerId);
    if (!m) return undefined;
    const method = m.kind === "CARD" ? "CARD" : "MOBILE_MONEY";
    const a: AttemptRec = {
      id: `pay_${randomUUID()}`,
      invoiceId: inv.id,
      ownerId: s.ownerId,
      method,
      accountId: m.id,
      amount: inv.total,
      currency: inv.currency,
      status: "PENDING",
      createdAt: this.now().toISOString(),
      expiresAt: method === "MOBILE_MONEY" ? new Date(this.now().getTime() + MOBILE_MONEY_TTL_MIN * 60_000).toISOString() : undefined,
    };
    await this.d.store.putAttempt(a);
    try {
      const { providerRef } = await this.d.provider.charge({ attemptId: a.id, method, amount: a.amount, currency: a.currency, accountLabel: m.masked });
      a.providerRef = providerRef;
      await this.d.store.putAttempt(a);
    } catch {
      await this.settle(a, "FAILED", "Prestataire de paiement injoignable.");
      return a;
    }
    if (method === "MOBILE_MONEY") this.notify(s.ownerId, `Validez le paiement de votre abonnement Keyo (${fmt(inv.total, inv.currency)}) sur votre téléphone avec votre code ${m.label}.`);
    return a;
  }

  /** Webhook signé du prestataire : seule source du statut « payé ». Idempotent. */
  async webhook(body: unknown, signature: string | undefined) {
    const e = this.d.provider.verify(body, signature);
    if (!e) throw new BillingError("Signature invalide.", 401);
    const a = await this.d.store.attemptByRef(e.providerRef);
    if (!a) throw new BillingError("Paiement inconnu.", 404);
    if (a.status !== "PENDING") return { ok: true, already: true };
    await this.settle(a, e.status, e.reason);
    return { ok: true };
  }

  private async settle(a: AttemptRec, status: "SUCCEEDED" | "FAILED" | "EXPIRED", reason?: string) {
    a.status = status;
    a.failureReason = status === "SUCCEEDED" ? undefined : (reason ?? (status === "EXPIRED" ? "Demande non validée à temps." : "Paiement refusé."));
    a.settledAt = this.now().toISOString();
    await this.d.store.putAttempt(a);
    const inv = (await this.d.store.getInvoice(a.invoiceId))!;
    const s = (await this.d.store.getSub(a.ownerId))!;
    if (status === "SUCCEEDED") {
      inv.status = "PAID";
      inv.paidAt = a.settledAt;
      await this.d.store.putInvoice(inv);
      s.status = "ACTIVE";
      s.periodEnd = inv.periodEnd;
      s.planId = s.nextPlanId ?? s.planId;
      s.nextPlanId = null;
      s.reminded = [];
      await this.d.store.putSub(s);
      this.notify(a.ownerId, `Paiement reçu : ${fmt(inv.total, inv.currency)}. Merci, votre abonnement Keyo est à jour jusqu'au ${frDate(inv.periodEnd)}.`);
      return;
    }
    inv.status = "FAILED";
    inv.failedAttempts += 1;
    await this.d.store.putInvoice(inv);
    if (s.status === "TRIALING" || s.status === "ACTIVE") s.status = "PAST_DUE";
    await this.d.store.putSub(s);
    this.notify(a.ownerId, `Le paiement de votre abonnement Keyo n'a pas abouti (${a.failureReason}) Nous réessaierons dans quelques jours ; vous pouvez aussi payer dès maintenant depuis Mon abonnement.`);
  }

  /** Tâche planifiée (chaque heure) : échéances, relances, expirations, lecture seule. */
  async tick() {
    const nowIso = this.now().toISOString();
    for (const a of await this.d.store.pendingAttempts()) if (a.expiresAt && a.expiresAt < nowIso) await this.settle(a, "EXPIRED");
    for (const s of await this.d.store.allSubs()) {
      try {
        await this.step(s.ownerId);
      } catch (e) {
        this.log.warn(`${s.ownerId} : ${e instanceof Error ? e.message : e}`);
      }
    }
  }

  /** Applique la prochaine action d'un abonnement (exposé pour les tests). */
  async step(ownerId: string) {
    const s = await this.ensure(ownerId);
    const action = nextBillingAction(await this.state(s), this.today());
    if (!action) return null;
    switch (action.kind) {
      case "REMIND_TRIAL":
        s.reminded = [...s.reminded, action.key];
        await this.d.store.putSub(s);
        this.notify(ownerId, `Votre essai Keyo se termine ${action.daysLeft <= 1 ? "demain" : `dans ${action.daysLeft} jours`}. Ajoutez une carte ou un compte Mobile Money dans Mon abonnement pour continuer sans interruption.`);
        break;
      case "CHARGE": {
        if (!s.planId && !s.nextPlanId) {
          // Sur devis : pas de prélèvement automatique, DK Group prend contact.
          s.status = "ACTIVE";
          s.periodEnd = addPeriod(s.periodEnd, s.period);
          await this.d.store.putSub(s);
          break;
        }
        const existing = (await this.d.store.invoices(ownerId)).find((i) => i.status === "OPEN" || i.status === "FAILED");
        const inv = existing ?? (await this.issue(s));
        const a = await this.attempt(s, inv);
        if (!a) {
          s.status = "PAST_DUE";
          await this.d.store.putSub(s);
          this.notify(ownerId, `Votre abonnement Keyo est arrivé à échéance (${fmt(inv.total, inv.currency)}). Ajoutez une carte ou un compte Mobile Money dans Mon abonnement.`);
        }
        break;
      }
      case "RETRY": {
        const inv = (await this.d.store.invoices(ownerId)).find((i) => i.status === "OPEN" || i.status === "FAILED")!;
        await this.attempt(s, inv);
        break;
      }
      case "LOCK":
        s.status = "READ_ONLY";
        await this.d.store.putSub(s);
        this.notify(ownerId, "Votre abonnement Keyo est en lecture seule : vous voyez toutes vos données, mais l'agent n'agit plus pour vous. Vos loyers continuent d'arriver sur votre compte. Réglez l'échéance dans Mon abonnement pour tout réactiver.");
        break;
      case "CANCEL":
        s.status = "CANCELED";
        await this.d.store.putSub(s);
        this.notify(ownerId, "Votre abonnement Keyo est résilié. Vos données restent consultables.");
        break;
    }
    return action;
  }

  // ── Agent : lecture seule, quota d'analyses d'expert, coût ──────────────────

  async agentAllowed(ownerId: string) {
    return agentActionsAllowed((await this.ensure(ownerId)).status);
  }

  /** Analyse d'expert : comprise, ou supplémentaire (accord requis, facturée à la prochaine échéance). */
  async expertAllowance(ownerId: string) {
    const v = await this.view(ownerId);
    return { remaining: v.expert.remaining, included: v.expert.included, extraPrice: v.expert.extraPrice };
  }

  async recordUsage(u: Omit<UsageRec, "at">) {
    await this.ensure(u.ownerId);
    await this.d.store.addUsage({ ...u, at: this.now().toISOString() });
  }
}

const fmt = (minor: number, c: string) => (c === "XOF" ? `${minor.toLocaleString("fr-FR")} FCFA` : `${(minor / 100).toLocaleString("fr-FR", { minimumFractionDigits: 2 })} €`);
const frDate = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

const invoiceView = (i: InvoiceRec): InvoiceView => ({
  id: i.id,
  number: i.number,
  issuedAt: i.issuedAt,
  periodStart: i.periodStart,
  periodEnd: i.periodEnd,
  lines: i.lines,
  total: { amount: i.total, currency: i.currency },
  vat: { amount: i.vat, currency: i.currency },
  status: i.status,
  paidAt: i.paidAt,
  failedAttempts: i.failedAttempts,
});

const attemptView = (a: AttemptRec): PaymentAttemptView => ({
  id: a.id,
  invoiceId: a.invoiceId,
  method: a.method,
  status: a.status,
  needsOwnerApproval: a.method === "MOBILE_MONEY" && a.status === "PENDING",
  amount: { amount: a.amount, currency: a.currency },
  createdAt: a.createdAt,
  failureReason: a.failureReason,
});
