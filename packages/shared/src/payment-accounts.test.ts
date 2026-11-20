import { test } from "node:test";
import assert from "node:assert/strict";
import { holderMatches, isIvorianMobile, isValidIban, maskAccount, NewPaymentAccount, receivingAccountFor } from "./payment-accounts.ts";

test("numéros Mobile Money ivoiriens et IBAN", () => {
  assert.ok(isIvorianMobile("+2250700000001"));
  assert.ok(isIvorianMobile("+2250501020304"));
  assert.ok(!isIvorianMobile("+2250900000001"));
  assert.ok(!isIvorianMobile("+33612345678"));
  assert.ok(isValidIban("FR76 3000 6000 0112 3456 7890 189"));
  assert.ok(!isValidIban("FR76 3000 6000 0112 3456 7890 188"), "clé fausse");
  assert.ok(!isValidIban("bonjour"));
});

test("saisie : Mobile Money ou banque ; pas de virement bancaire pour l'abonnement", () => {
  assert.ok(NewPaymentAccount.safeParse({ kind: "MOBILE_MONEY", purpose: "RECEIVE", operator: "WAVE", phone: "+2250700000001", holder: "Daniel Komoé" }).success);
  assert.ok(!NewPaymentAccount.safeParse({ kind: "MOBILE_MONEY", purpose: "RECEIVE", operator: "WAVE", phone: "+2250900000001", holder: "Daniel" }).success);
  assert.ok(!NewPaymentAccount.safeParse({ kind: "BANK", purpose: "SUBSCRIPTION", bankName: "SGBCI", iban: "FR7630006000011234567890189", holder: "Daniel" }).success);
});

test("affichage masqué : le numéro complet n'apparaît jamais", () => {
  const m = maskAccount({ kind: "MOBILE_MONEY", operator: "WAVE", phone: "+2250700004217" });
  assert.deepEqual(m, { label: "Wave", masked: "•••• 42 17" });
  assert.ok(!JSON.stringify(m).includes("070000"));
  assert.equal(maskAccount({ kind: "BANK", bankName: "SGBCI", iban: "FR7630006000011234567890189" }).masked, "•••• 0189");
});

test("compte d'un bien : attribué, sinon par défaut ; jamais un compte non vérifié", () => {
  const base = { purpose: "RECEIVE" as const, assetIds: [] as string[], isDefault: false };
  const def = { ...base, id: "d", status: "VERIFIED" as const, isDefault: true };
  const villa = { ...base, id: "v", status: "VERIFIED" as const, assetIds: ["villa"] };
  const pending = { ...base, id: "p", status: "PENDING" as const, assetIds: ["plantation"] };
  assert.equal(receivingAccountFor([def, villa, pending], "villa")?.id, "v");
  assert.equal(receivingAccountFor([def, villa, pending], "plantation")?.id, "d");
  assert.equal(receivingAccountFor([pending], "plantation"), undefined);
  assert.equal(receivingAccountFor([{ ...def, purpose: "SUBSCRIPTION" as const }], "villa"), undefined);
});

test("titulaire comparé au propriétaire", () => {
  assert.ok(holderMatches("KOMOE Daniel", "Daniel Komoé"));
  assert.ok(!holderMatches("Awa Traoré", "Daniel Komoé"));
});

test("contrôle de gestion : bien loué sans compte de réception", async () => {
  const { runAudit } = await import("./audit.ts");
  const base = { assets: [{ id: "villa", name: "Villa", type: "REAL_ESTATE", location: { country: "CI", city: "Abidjan" }, currency: "XOF", details: {} }], units: [], parties: [], agreements: [{ id: "g", kind: "LEASE", assetId: "villa", unitId: "u", partyId: "p", startDate: "2026-01-01", periodicAmount: { amount: 1, currency: "XOF" }, dueDay: 5 }], schedule: [], events: [], documents: [], today: "2026-11-20" } as never as Parameters<typeof runAudit>[0];
  assert.ok(!runAudit(base).findings.some((f) => f.area === "PAYMENTS"), "inconnu : pas contrôlé");
  assert.ok(runAudit({ ...base, paymentAccounts: [] }).findings.some((f) => f.id === "payout-none"));
  assert.ok(!runAudit({ ...base, paymentAccounts: [{ purpose: "RECEIVE", status: "VERIFIED", isDefault: true, assetIds: [] }] }).findings.some((f) => f.area === "PAYMENTS"));
});

test("cartes : marque, clé de Luhn, expiration", async () => {
  const { cardBrand, luhnValid, cardExpired } = await import("./payment-accounts.ts");
  assert.equal(cardBrand("4242 4242 4242 4242"), "VISA");
  assert.equal(cardBrand("5555 5555 5555 4444"), "MASTERCARD");
  assert.equal(cardBrand("3782 822463 10005"), "AMEX");
  assert.ok(luhnValid("4242 4242 4242 4242"));
  assert.ok(!luhnValid("4242 4242 4242 4241"));
  assert.ok(!cardExpired(11, 2026, "2026-11-20"));
  assert.ok(cardExpired(10, 2026, "2026-11-20"));
});
