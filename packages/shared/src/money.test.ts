import { test } from "node:test";
import assert from "node:assert/strict";
import { addMoney, formatAmount, formatMoney, money, sumMoney } from "./money.ts";

test("formate le FCFA sans décimales, milliers séparés", () => {
  assert.equal(formatAmount(money(1250000, "XOF")), "1 250 000");
  assert.equal(formatMoney(money(150000, "XOF")), "150 000 FCFA");
});

test("formate l'euro avec ses centimes", () => {
  assert.equal(formatAmount(money(805, "EUR")), "8,05");
  assert.equal(formatAmount(money(800, "EUR")), "8");
});

test("refuse les montants non entiers", () => {
  assert.throws(() => money(10.5, "XOF"));
});

test("refuse d'additionner deux devises", () => {
  assert.throws(() => addMoney(money(1, "XOF"), money(1, "EUR")));
  assert.deepEqual(sumMoney([money(1, "XOF"), money(2, "XOF")], "XOF"), money(3, "XOF"));
});

import { formatLocal, PHONE_COUNTRIES, toE164 } from "./phone.ts";

test("numéros E.164", () => {
  const [ci, fr] = PHONE_COUNTRIES;
  assert.equal(toE164(ci, "07 00 00 00 01"), "+2250700000001");
  assert.equal(toE164(fr, "06 12 34 56 78"), "+33612345678");
  assert.equal(toE164(ci, "0700"), null);
  assert.equal(formatLocal(ci, "0700000001"), "07 00 00 00 01");
});
