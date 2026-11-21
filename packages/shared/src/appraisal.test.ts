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

test("types ouverts : maison, appartement, immeuble, plantation", () => {
  assert.equal(appraisalKind(asset({})), "HOUSE");
  assert.equal(appraisalKind(asset({ details: { kind: "BUILDING" } })), "BUILDING");
  assert.equal(appraisalKind(asset({ details: { kind: "COMMERCIAL" } })), null);
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

test("immeuble loué : rendement et comparaison croisés, loyers préremplis depuis les baux, réparti au loyer", () => {
  const units: AssetUnit[] = [1, 2, 3, 4].map((i) => ({ id: `u${i}`, assetId: "a1", type: "REAL_ESTATE", label: `Appartement ${i}`, details: { rooms: 3, surfaceM2: 100, askingRent: i === 4 ? 300_000 : 0 } }));
  const lease = (i: number, amount: number) => ({ id: `g${i}`, assetId: "a1", unitId: `u${i}`, kind: "LEASE" as const, partyId: `p${i}`, startDate: "2025-01-01", periodicAmount: { amount, currency: "XOF" as const }, dueDay: 5, period: "MONTHLY" as const });
  const agreements = [lease(1, 300_000), lease(2, 300_000), lease(3, 600_000)];
  const a = asset({ details: { kind: "BUILDING" } });
  const qs = appraisalQuestions(a, units, agreements, ctx.today);
  // 3 baux (1 200 000) + loyer demandé du logement vide (300 000)
  assert.equal(qs.find((q) => q.id === "monthlyRent")!.prefill, 1_500_000);
  assert.equal(qs.find((q) => q.id === "surface")!.prefill, 400);
  assert.equal(qs.find((q) => q.id === "occupancy")!.prefill, "MOST");
  const r = appraise({
    ...ctx,
    units,
    agreements,
    asset: a,
    answers: { tier: "RESIDENTIAL", use: "RESIDENTIAL", floors: 3, occupancy: "FULL", age: "LT5", condition: "GOOD", finish: "STANDARD", legal: "TF", permit: "YES", access: "PAVED", equipment: [] },
  })!;
  // Rendement : 18 000 000 × 0,95 × 0,8 / 0,09 = 152 000 000 ; comparaison : 400 × 500 000 × 0,85 = 170 000 000
  // 0,6 × 152 000 000 + 0,4 × 170 000 000 = 159 200 000
  assert.equal(r.kind, "BUILDING");
  assert.equal(r.value.amount, 159_000_000);
  assert.deepEqual(r.missing, []);
  assert.ok(r.method.startsWith("Capitalisation"));
  // Répartition au loyer : 300 / 300 / 600 / 300
  assert.deepEqual(r.perUnit.map((u) => u.value.amount), [31_800_000, 31_800_000, 63_600_000, 31_800_000]);
});

test("immeuble sans loyers connus : comparaison seule, permis et titre pris en compte", () => {
  const r = appraise({
    ...ctx,
    asset: asset({ details: { kind: "BUILDING" } }),
    answers: { tier: "POPULAR", use: "MIXED", floors: 4, unitsCount: 8, surface: 600, land: 300, age: "15_30", condition: "WORKS", finish: "BASIC", legal: "ACD", permit: "PARTIAL", access: "PAVED" },
  })!;
  assert.ok(r.method.startsWith("Comparaison"));
  assert.ok(r.missing.includes("monthlyRent"));
  assert.equal(r.confidence, "LOW");
  assert.ok(r.factors.some((f) => f.label.startsWith("Permis")));
  assert.ok(r.value.amount > 0);
});

test("la fiche du bien préremplit l'expertise, et l'expertise complète la fiche", async () => {
  const { ficheAnswers, ficheFromAnswers } = await import("./appraisal.ts");
  const a = asset({ details: { kind: "APARTMENT", tier: "PRIME", builtAge: "5_15", condition: "GOOD", finish: "STANDARD", legal: "ACD", access: "PAVED", amenities: ["GENERATOR", "LIFT"] } });
  const u: AssetUnit = { id: "u1", assetId: "a1", type: "DWELLING", label: "Appartement", details: { bedrooms: 2, livingRooms: 1, bathrooms: 2, surfaceM2: 90, floor: 5, acUnits: 2, balcony: true, electricityMeter: "INDIVIDUAL" } };
  assert.deepEqual(ficheAnswers(a, [u]), { tier: "PRIME", age: "5_15", condition: "GOOD", finish: "STANDARD", legal: "ACD", access: "PAVED", surface: 90, rooms: 3, equipment: ["GENERATOR", "LIFT", "AC", "TERRACE", "METERS"], floor: "HIGH_LIFT" });
  const q = appraisalQuestions(a, [u]);
  assert.equal(q.find((x) => x.id === "surface")?.prefill, 90);
  assert.deepEqual(q.find((x) => x.id === "equipment")?.prefill, ["GENERATOR", "LIFT", "AC", "TERRACE"]);
  // Fiche complète : l'estimation n'attend plus aucune réponse obligatoire.
  const r = appraise({ ...ctx, units: [u], asset: a, answers: {} })!;
  assert.deepEqual(r.missing, []);

  const back = ficheFromAnswers(asset({}), { tier: "RESIDENTIAL", age: "GT30", land: 500, equipment: ["POOL", "AC", "TERRACE"], surface: 180, legal: null, surroundings: [] });
  assert.deepEqual(back.asset, { tier: "RESIDENTIAL", builtAge: "GT30", landM2: 500, amenities: ["POOL"] });
  assert.deepEqual(back.unit, { surfaceM2: 180, balcony: true });
});

test("cour commune estimée comme un immeuble de rapport", () => {
  assert.equal(appraisalKind(asset({ details: { kind: "COURTYARD" } })), "BUILDING");
});

test("typologie à l'ivoirienne", async () => {
  const { layoutLabel, roomsOf } = await import("./modules/real-estate.ts");
  assert.equal(layoutLabel({ bedrooms: 0, livingRooms: 1, bathrooms: 1 }), "Studio (1 douche)");
  assert.equal(layoutLabel({ bedrooms: 1, livingRooms: 1, bathrooms: 1, toilets: 1, toiletsPlace: "OUTSIDE" }), "Chambre-salon (1 douche, 1 toilette extérieure)");
  assert.equal(layoutLabel({ bedrooms: 3, livingRooms: 1, bathrooms: 2, toilets: 2 }), "4 pièces (3 chambres, 1 salon, 2 douches, 2 toilettes)");
  assert.equal(layoutLabel({ rooms: 3 }), "3 pièces");
  assert.equal(roomsOf({ bedrooms: 2, livingRooms: 1, rooms: 5 }), 3);
});
