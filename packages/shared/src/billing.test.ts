import assert from "node:assert/strict";
import test from "node:test";
import { managedUnits, addPeriod, agencySavings, agentActionsAllowed, expertRemaining, nextBillingAction, planById, planChange, planFor, planPrice, vatIncluded, type BillingState } from "./billing.ts";

test("formule selon le nombre de logements ; au-delà de 15, sur devis", () => {
  assert.equal(planFor(0)!.id, "ESSENTIEL");
  assert.equal(planFor(2)!.id, "ESSENTIEL");
  assert.equal(planFor(3)!.id, "CONFORT");
  assert.equal(planFor(6)!.id, "CONFORT");
  assert.equal(planFor(7)!.id, "PATRIMOINE");
  assert.equal(planFor(15)!.id, "PATRIMOINE");
  assert.equal(planFor(16), null);
});

test("prix : annuel = 10 mois ; TVA comprise", () => {
  const c = planById("CONFORT");
  assert.deepEqual(planPrice(c, "MONTHLY", "XOF"), { amount: 19_900, currency: "XOF" });
  assert.deepEqual(planPrice(c, "YEARLY", "XOF"), { amount: 199_000, currency: "XOF" });
  // 19 900 TTC = 16 864 HT + 3 036 de TVA à 18 %
  assert.equal(vatIncluded(19_900, "XOF"), 3_036);
  assert.equal(vatIncluded(2_990, "EUR"), 498);
});

test("dates d'échéance : fin de mois ramenée au dernier jour", () => {
  assert.equal(addPeriod("2026-01-31", "MONTHLY"), "2026-02-28");
  assert.equal(addPeriod("2026-12-15", "MONTHLY"), "2027-01-15");
  assert.equal(addPeriod("2028-02-29", "YEARLY"), "2029-02-28");
});

test("économie face à une agence à 10 %", () => {
  assert.deepEqual(agencySavings(2_900_000, 19_900), { agency: 290_000, keyo: 19_900, saved: 270_100 });
});

test("changement de formule à la prochaine échéance", () => {
  assert.deepEqual(planChange("ESSENTIEL", 3), { next: "CONFORT", direction: "UP" });
  assert.deepEqual(planChange("CONFORT", 1), { next: "ESSENTIEL", direction: "DOWN" });
  assert.equal(planChange("CONFORT", 4), null);
  assert.deepEqual(planChange("PATRIMOINE", 20), { next: null, direction: "CUSTOM" });
  assert.equal(expertRemaining(planById("ESSENTIEL"), 5), 0);
});

const base: BillingState = { status: "TRIALING", trialEndsAt: "2026-12-20", periodEnd: "2026-12-20", cancelAtPeriodEnd: false, hasPaymentMethod: false, pendingPayment: false, reminded: [] };

test("essai : rappels à J-7 et J-1 sans moyen de paiement, puis prélèvement", () => {
  assert.equal(nextBillingAction(base, "2026-12-01"), null);
  assert.deepEqual(nextBillingAction(base, "2026-12-13"), { kind: "REMIND_TRIAL", daysLeft: 7, key: "trial-7" });
  assert.equal(nextBillingAction({ ...base, reminded: ["trial-7"] }, "2026-12-15"), null);
  assert.deepEqual(nextBillingAction({ ...base, reminded: ["trial-7"] }, "2026-12-19"), { kind: "REMIND_TRIAL", daysLeft: 1, key: "trial-1" });
  assert.equal(nextBillingAction({ ...base, hasPaymentMethod: true }, "2026-12-13"), null, "pas de rappel si un moyen est enregistré");
  assert.deepEqual(nextBillingAction(base, "2026-12-20"), { kind: "CHARGE" });
});

test("échec de paiement : nouvelles tentatives à J+3 et J+7, puis lecture seule", () => {
  const due = { ...base, status: "PAST_DUE" as const, hasPaymentMethod: true };
  const at = (n: number) => ({ ...due, unpaid: { dueDate: "2026-12-20", failedAttempts: n } });
  assert.equal(nextBillingAction(at(1), "2026-12-21"), null);
  assert.deepEqual(nextBillingAction(at(1), "2026-12-23"), { kind: "RETRY", attempt: 2 });
  assert.equal(nextBillingAction(at(2), "2026-12-25"), null);
  assert.deepEqual(nextBillingAction(at(2), "2026-12-27"), { kind: "RETRY", attempt: 3 });
  assert.deepEqual(nextBillingAction(at(3), "2026-12-27"), { kind: "LOCK" });
  assert.equal(nextBillingAction({ ...at(3), status: "READ_ONLY" }, "2026-12-28"), null);
  assert.equal(nextBillingAction({ ...at(1), pendingPayment: true }, "2026-12-23"), null, "rien pendant un paiement en cours");
});

test("sans moyen de paiement à la fin de l'essai : lecture seule après 7 jours", () => {
  const s = { ...base, status: "PAST_DUE" as const, unpaid: { dueDate: "2026-12-20", failedAttempts: 0 } };
  assert.equal(nextBillingAction(s, "2026-12-22"), null);
  assert.deepEqual(nextBillingAction(s, "2026-12-27"), { kind: "LOCK" });
  assert.deepEqual(nextBillingAction({ ...s, hasPaymentMethod: true }, "2026-12-22"), { kind: "CHARGE" }, "moyen ajouté entre-temps : on encaisse");
});

test("abonnement actif : échéance, résiliation en fin de période ; lecture seule n'arrête que l'agent", () => {
  const active = { ...base, status: "ACTIVE" as const, trialEndsAt: undefined, periodEnd: "2027-01-20", hasPaymentMethod: true };
  assert.equal(nextBillingAction(active, "2027-01-19"), null);
  assert.deepEqual(nextBillingAction(active, "2027-01-20"), { kind: "CHARGE" });
  assert.deepEqual(nextBillingAction({ ...active, cancelAtPeriodEnd: true }, "2027-01-20"), { kind: "CANCEL" });
  assert.ok(agentActionsAllowed("PAST_DUE"));
  assert.ok(!agentActionsAllowed("READ_ONLY"));
});

test("logements gérés : un par logement immobilier, un par plantation", () => {
  const a = (id: string, type: "REAL_ESTATE" | "PLANTATION") => ({ id, type, ownerId: "o", name: id, location: { address: "", city: "", country: "CI" as const, lat: 0, lng: 0 }, details: {}, currency: "XOF" as const, createdAt: "" });
  const u = (id: string, assetId: string) => ({ id, assetId, type: "X", label: id, details: {} });
  assert.equal(managedUnits([a("villa", "REAL_ESTATE"), a("immeuble", "REAL_ESTATE"), a("cacao", "PLANTATION"), a("vide", "REAL_ESTATE")], [u("1", "villa"), u("2", "immeuble"), u("3", "immeuble"), u("4", "immeuble"), u("p1", "cacao"), u("p2", "cacao")]), 6);
});
