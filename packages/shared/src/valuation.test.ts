import assert from "node:assert/strict";
import test from "node:test";
import type { Agreement, Asset, AssetUnit } from "./domain.ts";
import { roundValue, valueAsset } from "./valuation.ts";

const asset = (extra: Partial<Asset> = {}): Asset => ({
  id: "a1",
  ownerId: "me",
  type: "REAL_ESTATE",
  name: "Villa",
  location: { address: "", city: "Abidjan", country: "CI", lat: 5, lng: -4 },
  details: { kind: "BUILDING", purchasePrice: 40_000_000 },
  currency: "XOF",
  createdAt: "2024-01-01T00:00:00.000Z",
  ...extra,
});
const unit = (id: string, askingRent: number, value?: number): AssetUnit => ({ id, assetId: "a1", type: "DWELLING", label: id, details: { askingRent, ...(value ? { value } : {}) } });
const lease = (unitId: string, amount: number): Agreement =>
  ({ id: `g-${unitId}`, assetId: "a1", unitId, kind: "LEASE", partyId: "p", startDate: "2025-01-01", periodicAmount: { amount, currency: "XOF" }, dueDay: 5, period: "MONTHLY" }) as Agreement;

test("revenu capitalisé à 8 % en Côte d'Ivoire, mêlé au prix d'achat", () => {
  const v = valueAsset({ asset: asset(), units: [unit("u1", 200_000), unit("u2", 100_000)], agreements: [lease("u1", 250_000)], documents: [], today: "2026-11-19" });
  // u1 : 250 000 × 12 / 8 % = 37 500 000 ; u2 : 100 000 × 12 / 8 % = 15 000 000
  assert.equal(v.units[0]!.incomeValue?.amount, 37_500_000);
  assert.equal(v.units[1]!.source, "ASKING");
  assert.equal(v.incomeValue?.amount, 52_500_000);
  assert.equal(v.suggested?.amount, roundValue({ amount: 52_500_000 * 0.7 + 40_000_000 * 0.3, currency: "XOF" }).amount);
  assert.equal(v.confidence, "MEDIUM");
  assert.ok(v.missing.some((x) => x.includes("expertise")));
});

test("valeurs saisies par unité : elles priment", () => {
  const v = valueAsset({ asset: asset(), units: [unit("u1", 200_000, 30_000_000), unit("u2", 100_000, 12_000_000)], agreements: [], documents: [], today: "2026-11-19" });
  assert.equal(v.suggested?.amount, 42_000_000);
});

test("véhicule : prix d'achat décoté, pas de capitalisation", () => {
  const v = valueAsset({
    asset: asset({ type: "VEHICLE", details: { kind: "TAXI", purchasePrice: 10_000_000 }, createdAt: "2024-11-19T00:00:00.000Z" }),
    units: [unit("u1", 300_000)],
    agreements: [],
    documents: [],
    today: "2026-11-19",
  });
  assert.equal(v.incomeValue, null);
  assert.ok(v.suggested!.amount > 7_000_000 && v.suggested!.amount < 7_400_000);
});
