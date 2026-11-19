import assert from "node:assert/strict";
import test from "node:test";
import type { Agreement, Asset, AssetUnit, ScheduleItem, Transaction } from "./domain.ts";
import { borrowingCapacity, ownerPassport } from "./owner-passport.ts";

const asset: Asset = { id: "a1", ownerId: "me", type: "REAL_ESTATE", name: "Villa", location: { address: "", city: "Abidjan", country: "CI", lat: 5, lng: -4 }, details: { kind: "HOUSE", purchasePrice: 50_000_000 }, currency: "XOF", createdAt: "2024-01-01T00:00:00.000Z" };
const unit: AssetUnit = { id: "u1", assetId: "a1", type: "DWELLING", label: "Villa", details: {} };
const lease = { id: "g1", assetId: "a1", unitId: "u1", kind: "LEASE", partyId: "p", startDate: "2025-01-01", periodicAmount: { amount: 300_000, currency: "XOF" }, dueDay: 5, period: "MONTHLY" } as Agreement;
const XOF = (amount: number) => ({ amount, currency: "XOF" as const });

// 12 échéances de déc. 2025 à nov. 2026 : 11 payées, la dernière en retard.
const months = Array.from({ length: 12 }, (_, i) => { const d = new Date(Date.UTC(2025, 11 + i, 5)); return d.toISOString().slice(0, 10); });
const schedule: ScheduleItem[] = months.map((d, i) => ({ id: `s${i}`, agreementId: "g1", dueDate: d, expected: XOF(300_000), received: XOF(i < 11 ? 300_000 : 0), status: i < 11 ? "PAID" : "LATE" }) as ScheduleItem);
const tx: Transaction[] = months.slice(0, 11).map((d, i) => ({ id: `t${i}`, assetId: "a1", direction: "IN", category: "RENT", amount: XOF(300_000), occurredAt: `${d}T09:00:00.000Z`, confirmedBy: "WEBHOOK", label: "Loyer" }));
tx.push({ id: "m1", assetId: "a1", direction: "IN", category: "RENT", amount: XOF(999_999), occurredAt: "2026-06-01T09:00:00.000Z", confirmedBy: "MANUAL", label: "Déclaré" });
tx.push({ id: "e1", assetId: "a1", direction: "OUT", category: "REPAIR", amount: XOF(240_000), occurredAt: "2026-03-01T09:00:00.000Z", confirmedBy: "MANUAL", label: "Plomberie" });

const base = { ownerId: "me", currency: "XOF" as const, assets: [asset], units: [unit], agreements: [lease], schedule, transactions: tx, shares: [], auditScore: 80, today: "2026-11-19" };

test("revenus certifiés : seuls les encaissements confirmés par webhook comptent", () => {
  const p = ownerPassport(base);
  assert.equal(p.certifiedIncome12m.amount, 3_300_000);
  assert.equal(p.expected12m.amount, 3_600_000);
  assert.equal(p.collectionRatePermille, 917);
  assert.equal(p.monthlyNet.amount, Math.round((3_300_000 - 240_000) / 11));
  assert.equal(p.patrimony.amount, 50_000_000);
  assert.ok(p.score > 0 && p.score <= 1000);
});

test("capacité d'emprunt : 70 % des loyers, endettement 33 %, crédits en cours déduits", () => {
  const p = ownerPassport(base);
  const b = borrowingCapacity({ passport: p, otherIncome: 1_000_000, existingLoans: 100_000, years: 15 });
  // loyers retenus : min(300 000, 300 000) × 70 % = 210 000 ; revenus retenus 1 210 000
  assert.equal(b.retainedIncome.amount, 1_210_000);
  // 33 % × 1 210 000 − 100 000 = 299 300
  assert.equal(b.maxInstallment.amount, 299_000);
  assert.ok(b.capacity.amount > 30_000_000 && b.capacity.amount < 31_000_000);
  assert.equal(b.currentDebtPermille, 83);
});

test("sans historique : score en construction, rien d'inventé", () => {
  const p = ownerPassport({ ...base, schedule: [], transactions: [], agreements: [], auditScore: 0 });
  assert.equal(p.level, "BUILDING");
  assert.equal(p.certifiedIncome12m.amount, 0);
  const b = borrowingCapacity({ passport: p, otherIncome: 0, existingLoans: 0, years: 10 });
  assert.equal(b.capacity.amount, 0);
});
