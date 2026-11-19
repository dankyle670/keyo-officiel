import { test } from "node:test";
import assert from "node:assert/strict";
import { decideAutonomy, defaultPolicy, levelOf, type AutonomyPolicy } from "./autonomy.ts";

const base = (): AutonomyPolicy => ({ ...defaultPolicy("XOF"), quietHours: undefined });

test("une action hors catalogue est toujours refusée", () => {
  for (const action of ["transfer_funds", "sign_lease", "terminate_lease", "start_lawsuit"]) {
    assert.equal(decideAutonomy(base(), { action }).kind, "BLOCKED");
  }
});

test("l'interrupteur général bloque tout, sauf un accord explicite", () => {
  const p = { ...base(), enabled: false };
  assert.equal(decideAutonomy(p, { action: "send_receipt" }).kind, "BLOCKED");
  assert.equal(decideAutonomy(p, { action: "send_receipt", approved: true }).kind, "EXECUTE");
});

test("niveaux par défaut : relance faite et notifiée, quittance faite seule", () => {
  const r = decideAutonomy(base(), { action: "send_rent_reminder" });
  assert.deepEqual([r.kind, r.kind === "EXECUTE" && r.notify], ["EXECUTE", true]);
  const q = decideAutonomy(base(), { action: "send_receipt" });
  assert.deepEqual([q.kind, q.kind === "EXECUTE" && q.notify], ["EXECUTE", false]);
});

test("le plafond de niveau ne peut pas être dépassé par le réglage", () => {
  const p = { ...base(), levels: { send_formal_notice: "AUTO" as const, publish_listing: "AUTO" as const } };
  assert.equal(levelOf(p, "send_formal_notice"), "ASK");
  assert.equal(decideAutonomy(p, { action: "send_formal_notice" }).kind, "ASK");
  assert.equal(levelOf(p, "publish_listing"), "NOTIFY");
});

test("OFF désactive l'action", () => {
  const p = { ...base(), levels: { send_rent_reminder: "OFF" as const } };
  assert.equal(decideAutonomy(p, { action: "send_rent_reminder" }).kind, "BLOCKED");
});

test("dépense : sous le plafond exécutée, au-delà ou sans montant soumise à accord", () => {
  const p = { ...base(), levels: { approve_quote: "AUTO" as const } };
  assert.equal(decideAutonomy(p, { action: "approve_quote", spend: { amount: 40_000, currency: "XOF" } }).kind, "EXECUTE");
  assert.equal(decideAutonomy(p, { action: "approve_quote", spend: { amount: 60_000, currency: "XOF" } }).kind, "ASK");
  assert.equal(decideAutonomy(p, { action: "approve_quote" }).kind, "ASK");
  assert.equal(decideAutonomy(p, { action: "approve_quote", spend: { amount: 100, currency: "EUR" } }).kind, "ASK");
});

test("heures calmes : les messages aux tiers sont différés, pas les actions internes", () => {
  const p = { ...base(), quietHours: { from: 20, to: 8 } };
  const r = decideAutonomy(p, { action: "send_rent_reminder", localHour: 22 });
  assert.equal(r.kind, "DEFER");
  assert.equal(decideAutonomy(p, { action: "send_rent_reminder", localHour: 3 }).kind, "DEFER");
  assert.equal(decideAutonomy(p, { action: "send_rent_reminder", localHour: 10 }).kind, "EXECUTE");
  assert.equal(decideAutonomy(p, { action: "triage_incident", localHour: 22 }).kind, "EXECUTE");
});
