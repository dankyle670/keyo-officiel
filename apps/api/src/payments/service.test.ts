import { test } from "node:test";
import assert from "node:assert/strict";
import { MemoryPaymentAccountStore } from "./store.ts";
import { PaymentAccountsService, PaymentError, SIMULATED_CODE } from "./service.ts";
import { open } from "./crypto.ts";

const O = "owner-1";
const wave = { kind: "MOBILE_MONEY", purpose: "RECEIVE", operator: "WAVE", phone: "+2250700004217", holder: "Daniel Komoé" };
const setup = (now = { t: Date.parse("2026-11-20T10:00:00Z") }) => {
  const store = new MemoryPaymentAccountStore();
  const sent: string[] = [];
  const svc = new PaymentAccountsService(store, { simulated: true, send: async (_to, text) => void sent.push(text) }, () => "Daniel Komoé", () => now.t);
  return { store, svc, sent, now };
};
const rejects = (p: Promise<unknown>, status: number) => assert.rejects(p, (e) => e instanceof PaymentError && e.status === status);

test("ajout : en attente, chiffré, masqué ; vérifié avec le code, devient le compte par défaut", async () => {
  const { svc, store, sent } = setup();
  const { account, challenge } = await svc.create(O, wave);
  assert.equal(account.status, "PENDING");
  assert.equal(account.masked, "•••• 42 17");
  assert.match(sent[0]!, /code 123456/);
  const rec = (await store.all(O))[0]!;
  assert.ok(!JSON.stringify(rec).includes("0700004217"), "jamais en clair");
  assert.equal(open(rec.sealed), "+2250700004217");
  assert.ok(!JSON.stringify(await svc.list(O)).includes("sealed"));
  assert.equal(await svc.receivingFor(O, "villa"), undefined, "pas utilisable avant vérification");
  const r = await svc.confirm(O, challenge.challengeId, SIMULATED_CODE);
  assert.equal(r.accounts[0]!.status, "VERIFIED");
  assert.equal(r.accounts[0]!.isDefault, true);
  assert.equal((await svc.receivingFor(O, "villa"))?.id, account.id);
});

test("modifier ou supprimer exige un code ; mauvais code, expiration, essais limités", async () => {
  const { svc, now } = setup();
  const { account, challenge } = await svc.create(O, wave);
  await svc.confirm(O, challenge.challengeId, SIMULATED_CODE);
  const ch = await svc.requestChange(O, account.id, { op: "UPDATE", patch: { assetIds: ["villa"] } });
  assert.equal((await svc.list(O))[0]!.assetIds.length, 0, "rien ne change avant le code");
  await rejects(svc.confirm(O, ch.challengeId, "000000"), 403);
  await svc.confirm(O, ch.challengeId, SIMULATED_CODE);
  assert.deepEqual((await svc.list(O))[0]!.assetIds, ["villa"]);
  const del = await svc.requestChange(O, account.id, { op: "DELETE" });
  for (let i = 0; i < 4; i++) await rejects(svc.confirm(O, del.challengeId, "000000"), 403);
  await rejects(svc.confirm(O, del.challengeId, "000000"), 403);
  await rejects(svc.confirm(O, del.challengeId, SIMULATED_CODE), 404);
  const late = await svc.requestChange(O, account.id, { op: "DELETE" });
  now.t += 6 * 60_000;
  await rejects(svc.confirm(O, late.challengeId, SIMULATED_CODE), 410);
  assert.equal((await svc.list(O)).length, 1);
});

test("doublon refusé ; un autre propriétaire ne peut pas confirmer ; titulaire différent signalé", async () => {
  const { svc } = setup();
  const { challenge } = await svc.create(O, wave);
  await rejects(svc.create(O, wave), 409);
  await rejects(svc.confirm("intrus", challenge.challengeId, SIMULATED_CODE), 404);
  const other = await svc.create(O, { ...wave, phone: "+2250500000001", operator: "MTN", holder: "Awa Traoré" });
  const r = await svc.confirm(O, other.challenge.challengeId, SIMULATED_CODE);
  assert.match(r.accounts.find((a) => a.id === other.account.id)!.warning ?? "", /différent/);
});

test("abonnement : un seul moyen ; le nouveau remplace l'ancien une fois vérifié", async () => {
  const { svc } = setup();
  const a = await svc.create(O, { ...wave, purpose: "SUBSCRIPTION" });
  await svc.confirm(O, a.challenge.challengeId, SIMULATED_CODE);
  const b = await svc.create(O, { ...wave, purpose: "SUBSCRIPTION", operator: "ORANGE", phone: "+2250700000002" });
  await svc.confirm(O, b.challenge.challengeId, SIMULATED_CODE);
  const subs = (await svc.list(O)).filter((x) => x.purpose === "SUBSCRIPTION");
  assert.deepEqual(subs.map((x) => x.id), [b.account.id]);
  await rejects(svc.create(O, { kind: "BANK", purpose: "SUBSCRIPTION", bankName: "SGBCI", iban: "FR7630006000011234567890189", holder: "Daniel" }), 400);
});
