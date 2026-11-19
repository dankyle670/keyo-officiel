import assert from "node:assert/strict";
import test from "node:test";
import type { Asset, AssetUnit } from "./domain.ts";
import { appraisalKind, appraisalQuestions, appraise } from "./appraisal.ts";

const asset = (extra: Partial<Asset>): Asset => ({
  id: "a1",
  ownerId: "me",
  type: "REAL_ESTATE",
  name: "Bien",
  location: { address: "", city: "Abidjan", country: "CI", lat: 5, lng: -4 },
  details: { kind: "HOUSE" },
  currency: "XOF",
  createdAt: "2024-01-01T00:00:00.000Z",
  ...extra,
});
const ctx = { units: [] as AssetUnit[], agreements: [], documents: [], today: "2026-11-19" };

test("types ouverts : maison, appartement, plantation", () => {
  assert.equal(appraisalKind(asset({})), "HOUSE");
  assert.equal(appraisalKind(asset({ details: { kind: "BUILDING" } })), null);
  assert.equal(appraisalKind(asset({ type: "VEHICLE", details: { kind: "TAXI" } })), null);
  assert.equal(appraise({ ...ctx, asset: asset({ type: "SHOP", details: { kind: "BOUTIQUE" } }), answers: {} }), null);
  assert.ok(appraisalQuestions(asset({ details: { kind: "APARTMENT" } }), []).some((q) => q.id === "floor"));
});

test("maison à Cocody : prix au m², terrain et ajustements", () => {
  const r = appraise({
    ...ctx,
    asset: asset({}),
    answers: { tier: "PRIME", surface: 200, land: 600, rooms: 5, age: "5_15", condition: "GOOD", finish: "STANDARD", equipment: ["POOL"], legal: "TF", access: "PAVED", ownerGuess: 200_000_000 },
  })!;
  // 200 × 900 000 × 0,92 = 165 600 000 ; terrain (600 − 100) × 250 000 = 125 000 000 ; × 1,04 piscine
  assert.equal(r.value.amount, 302_000_000);
  assert.equal(r.missing.length, 0);
  assert.equal(r.confidence, "MEDIUM");
  assert.ok(r.low.amount < r.value.amount && r.high.amount > r.value.amount);
  assert.equal(r.ownerGapPercent, -34);
});

test("questions obligatoires manquantes : fiabilité faible", () => {
  const r = appraise({ ...ctx, asset: asset({ details: { kind: "APARTMENT" } }), answers: { tier: "RESIDENTIAL", surface: 80 } })!;
  assert.equal(r.confidence, "LOW");
  assert.ok(r.missing.includes("condition"));
});

test("plantation de cacao en pleine production, répartie par parcelle", () => {
  const units: AssetUnit[] = [
    { id: "p1", assetId: "a1", type: "PLANTATION", label: "P1", details: { areaHa: 3 } },
    { id: "p2", assetId: "a1", type: "PLANTATION", label: "P2", details: { areaHa: 1 } },
  ];
  const r = appraise({
    ...ctx,
    units,
    asset: asset({ type: "PLANTATION", details: { kind: "COCOA" } }),
    answers: { stage: "FULL", region: "CW", upkeep: "FAIR", legal: "TF", access: "TRACK", equipment: [] },
  })!;
  // 4 ha (prérempli) × 2 500 000 + 4 ha × 500 000 = 12 000 000
  assert.equal(r.value.amount, 12_000_000);
  assert.deepEqual(r.perUnit.map((u) => u.value.amount), [9_000_000, 3_000_000]);
});
