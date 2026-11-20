import assert from "node:assert/strict";
import test from "node:test";
import type { PaymentAccountView } from "@keyo/shared";
import type { OwnerSnapshot } from "../autonomous/store.ts";
import { SimulatedBillingProvider, sign } from "./provider.ts";
import { BillingService } from "./service.ts";
import { MemoryBillingStore } from "./store.ts";

const O = "proprio";
const asset = (id: string) => ({ id, ownerId: O, type: "REAL_ESTATE" as const, name: id, location: { address: "", city: "Abidjan", country: "CI" as const, lat: 0, lng: 0 }, details: { kind: "APARTMENT" }, currency: "XOF" as const, createdAt: "2026-01-01T00:00:00.000Z" });
const unit = (id: string, assetId: string) => ({ id, assetId, type: "REAL_ESTATE", label: id, details: { rooms: 2 } });

function setup(units = 4) {
  let now = new Date("2026-11-20T10:00:00Z");
  const store = new MemoryBillingStore();
  const provider = new SimulatedBillingProvider();
  const snap: OwnerSnapshot = {
    ownerName: "Awa Koné",
    currency: "XOF",
    assets: [asset("a1")],
    units: Array.from({ length: units }, (_, i) => unit(`u${i}`, "a1")),
    parties: [],
    agreements: [{ id: "g1", assetId: "a1", unitId: "u0", kind: "LEASE", partyId: "p", startDate: "2025-01-01", periodicAmount: { amount: 500_000, currency: "XOF" }, dueDay: 5, period: "MONTHLY" }],
    schedule: [],
    transactions: [],
    events: [],
    documents: [],
    shares: [],
  };
  let accounts: PaymentAccountView[] = [];
  const notes: string[] = [];
  const svc = new BillingService({ store, provider, snapshot: () => snap, accounts: async () => accounts, notify: (_, m) => notes.push(m), now: () => now });
  provider.deliver = (e, sig) => svc.webhook(e, sig);
  return {
    svc,
    store,
    provider,
    snap,
    notes,
    at: (iso: string) => (now = new Date(`${iso}T10:00:00Z`)),
    pay: (kind: "CARD" | "MOBILE_MONEY", masked = "•••• 4242") =>
      (accounts = [{ id: "pa1", purpose: "SUBSCRIPTION", kind, label: kind === "CARD" ? "Visa" : "Wave", masked, holder: "Awa", status: "VERIFIED", isDefault: true, assetIds: [], createdAt: "" }]),
  };
}

const flush = () => new Promise((r) => setTimeout(r, 2100));

test("essai de 30 jours, formule selon les logements, économie face à une agence", async () => {
  const { svc } = setup(4);
  const v = await svc.view(O);
  assert.equal(v.status, "TRIALING");
  assert.equal(v.plan?.id, "CONFORT");
  assert.equal(v.trialEndsAt, "2026-12-20");
  assert.equal(v.expert.remaining, 10);
  assert.deepEqual(v.savings?.agency, { amount: 50_000, currency: "XOF" });
  assert.ok(v.agentActions);
});

test("fin d'essai par carte : facture, webhook, actif jusqu'au mois suivant, reçu PDF", async () => {
  const t = setup(4);
  await t.svc.ensure(O);
  t.pay("CARD");
  t.at("2026-12-20");
  assert.deepEqual(await t.svc.step(O), { kind: "CHARGE" });
  assert.equal((await t.svc.view(O)).pendingAttempt?.status, "PENDING", "payé seulement après le webhook");
  await flush();
  const v = await t.svc.view(O);
  assert.equal(v.status, "ACTIVE");
  assert.equal(v.periodEnd, "2027-01-20");
  const [inv] = await t.svc.invoices(O);
  assert.equal(inv!.status, "PAID");
  assert.equal(inv!.total.amount, 19_900);
  assert.equal(inv!.vat.amount, 3_036);
  assert.match(inv!.number, /^KEYO-2026-000001$/);
  const { pdf } = await t.svc.receipt(O, inv!.id);
  assert.ok(pdf.subarray(0, 8).toString().startsWith("%PDF-1.4"));
  await assert.rejects(t.svc.receipt("autre", inv!.id));
});

test("carte refusée : relances à J+3 et J+7, puis lecture seule ; payer réactive", async () => {
  const t = setup(4);
  await t.svc.ensure(O);
  t.pay("CARD", "•••• 0002");
  t.at("2026-12-20");
  await t.svc.step(O);
  await flush();
  assert.equal((await t.svc.view(O)).status, "PAST_DUE");
  t.at("2026-12-23");
  assert.deepEqual(await t.svc.step(O), { kind: "RETRY", attempt: 2 });
  await flush();
  t.at("2026-12-27");
  assert.deepEqual(await t.svc.step(O), { kind: "RETRY", attempt: 3 });
  await flush();
  assert.deepEqual(await t.svc.step(O), { kind: "LOCK" });
  const locked = await t.svc.view(O);
  assert.equal(locked.status, "READ_ONLY");
  assert.ok(!locked.agentActions);
  assert.equal(locked.unpaid?.failedAttempts, 3);
  // Nouvelle carte, paiement immédiat : tout repart.
  t.pay("CARD", "•••• 4242");
  await t.svc.payNow(O);
  await flush();
  const v = await t.svc.view(O);
  assert.equal(v.status, "ACTIVE");
  assert.equal(v.periodEnd, "2027-01-20", "la période payée part de l'échéance, pas du jour du paiement");
});

test("Mobile Money : demande à valider, webhook signé exigé, expiration", async () => {
  const t = setup(1);
  await t.svc.ensure(O);
  t.pay("MOBILE_MONEY", "•••• 34 56");
  t.at("2026-12-20");
  await t.svc.step(O);
  const v = await t.svc.view(O);
  assert.ok(v.pendingAttempt?.needsOwnerApproval);
  assert.ok(t.notes.some((n) => n.includes("Validez le paiement")));
  const a = (await t.store.pendingAttempts(O))[0]!;
  await assert.rejects(t.svc.webhook({ providerRef: a.providerRef, status: "SUCCEEDED" }, "fausse"), /Signature/);
  const e = { providerRef: a.providerRef!, status: "SUCCEEDED" as const };
  await t.svc.webhook(e, sign(e));
  assert.equal((await t.svc.view(O)).status, "ACTIVE");
  assert.deepEqual(await t.svc.webhook(e, sign(e)), { ok: true, already: true }, "webhook rejoué sans effet");
  // Échéance suivante non validée : expirée au bout de 15 minutes.
  t.at("2027-01-20");
  await t.svc.step(O);
  t.at("2027-01-21");
  await t.svc.tick();
  assert.equal((await t.svc.view(O)).status, "PAST_DUE");
});

test("analyses d'expert : quota puis supplément facturé à l'échéance suivante ; formule suit les logements", async () => {
  const t = setup(1);
  await t.svc.ensure(O);
  for (let i = 0; i < 3; i++) await t.svc.recordUsage({ ownerId: O, kind: "chat", tier: "EXPERT", model: "opus", inputTokens: 1, cacheWrite: 0, cacheRead: 0, outputTokens: 1, webSearches: 0, costMicroUsd: 1, expert: true, extraBilled: false });
  assert.equal((await t.svc.expertAllowance(O)).remaining, 0);
  await t.svc.recordUsage({ ownerId: O, kind: "chat", tier: "EXPERT", model: "opus", inputTokens: 1, cacheWrite: 0, cacheRead: 0, outputTokens: 1, webSearches: 0, costMicroUsd: 1, expert: true, extraBilled: true });
  t.pay("CARD");
  // Deux logements de plus pendant l'essai : la formule suit.
  t.snap.units.push(unit("x1", "a1"), unit("x2", "a1"));
  assert.equal((await t.svc.view(O)).plan?.id, "CONFORT");
  t.at("2026-12-20");
  await t.svc.step(O);
  await flush();
  const [inv] = await t.svc.invoices(O);
  assert.deepEqual(inv!.lines.map((l) => l.amount), [19_900, 1_000]);
  assert.equal(inv!.total.amount, 20_900);
});

test("résiliation en fin de période ; annuel = 10 mois", async () => {
  const t = setup(4);
  await t.svc.ensure(O);
  t.pay("CARD");
  await t.svc.setPeriod(O, "YEARLY");
  t.at("2026-12-20");
  await t.svc.step(O);
  await flush();
  const v = await t.svc.view(O);
  assert.equal(v.periodEnd, "2027-12-20");
  assert.equal((await t.svc.invoices(O))[0]!.total.amount, 199_000);
  await t.svc.cancel(O, true);
  t.at("2027-12-20");
  assert.deepEqual(await t.svc.step(O), { kind: "CANCEL" });
  assert.equal((await t.svc.view(O)).status, "CANCELED");
});
