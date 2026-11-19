import assert from "node:assert/strict";
import test from "node:test";
import type { Asset, AssetShare } from "./domain.ts";
import { holderPatrimony, shareTotal, sharesOf, totalPatrimony } from "./patrimony.ts";

const asset = (id: string, extra: Partial<Asset> = {}): Asset => ({
  id,
  ownerId: "me",
  type: "REAL_ESTATE",
  name: id,
  location: { address: "", city: "Abidjan", country: "CI", lat: 5, lng: -4 },
  details: { kind: "HOUSE", purchasePrice: 30_000_000 },
  currency: "XOF",
  createdAt: "2025-01-01T00:00:00.000Z",
  ...extra,
});

test("bien personnel : tout au propriétaire, même avec des parts saisies", () => {
  const a = asset("a1");
  assert.deepEqual(sharesOf(a, [{ assetId: "a1", holderId: "p1", sharePermille: 500 }]), [{ holderId: "me", sharePermille: 1000 }]);
});

test("bien de famille : part de chaque membre, valeur estimée prioritaire", () => {
  const fam = asset("a2", { holding: "FAMILY", value: { amount: 90_000_000, currency: "XOF" } });
  const shares: AssetShare[] = [
    { assetId: "a2", holderId: "me", sharePermille: 334 },
    { assetId: "a2", holderId: "p1", sharePermille: 333 },
    { assetId: "a2", holderId: "p2", sharePermille: 333 },
  ];
  assert.equal(shareTotal(fam, shares), 1000);
  const p1 = holderPatrimony([asset("a1"), fam], shares, "p1");
  assert.equal(p1.lines.length, 1);
  assert.deepEqual(p1.totals, [{ amount: 29_970_000, currency: "XOF" }]);
  const me = holderPatrimony([asset("a1"), fam], shares, "me");
  assert.deepEqual(me.totals, [{ amount: 30_000_000 + 30_060_000, currency: "XOF" }]);
});

test("totaux par devise, biens sans valeur comptés à part", () => {
  const eur = asset("a3", { currency: "EUR", details: { kind: "APARTMENT", purchasePrice: 25_000_000 } });
  const none = asset("a4", { details: { kind: "HOUSE" } });
  assert.deepEqual(totalPatrimony([asset("a1"), eur, none]), [
    { amount: 30_000_000, currency: "XOF" },
    { amount: 25_000_000, currency: "EUR" },
  ]);
  assert.equal(holderPatrimony([none], [], "me").unvalued, 1);
});
