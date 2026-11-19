import { test } from "node:test";
import assert from "node:assert/strict";
import type { Agreement } from "./domain.ts";
import { addMonths, buildMonthlySchedule, dueStatus, reminderPlan } from "./schedule.ts";

const XOF = (amount: number) => ({ amount, currency: "XOF" as const });
const lease: Agreement = {
  id: "g1",
  assetId: "a1",
  unitId: "u1",
  kind: "LEASE",
  partyId: "p1",
  startDate: "2026-09-15",
  periodicAmount: XOF(150000),
  dueDay: 5,
  period: "MONTHLY",
};

test("addMonths passe l'année", () => {
  assert.equal(addMonths("2026-11", 2), "2027-01");
  assert.equal(addMonths("2026-01", -1), "2025-12");
});

test("statuts : à venir, payé, partiel, en retard, impayé", () => {
  assert.equal(dueStatus(XOF(100), XOF(0), "2026-11-05", "2026-11-05"), "UPCOMING");
  assert.equal(dueStatus(XOF(100), XOF(100), "2026-11-05", "2026-11-20"), "PAID");
  assert.equal(dueStatus(XOF(100), XOF(40), "2026-11-05", "2026-11-20"), "PARTIAL");
  assert.equal(dueStatus(XOF(100), XOF(0), "2026-11-05", "2026-11-20"), "LATE");
  assert.equal(dueStatus(XOF(100), XOF(0), "2026-10-05", "2026-11-20"), "UNPAID");
});

test("échéancier du mois de début au mois demandé", () => {
  const items = buildMonthlySchedule(lease, "2026-12", "2026-11-19");
  assert.deepEqual(items.map((i) => i.dueDate), ["2026-09-15", "2026-10-05", "2026-11-05", "2026-12-05"]);
  assert.deepEqual(items.map((i) => i.status), ["UNPAID", "UNPAID", "LATE", "UPCOMING"]);
  assert.ok(items.every((i) => i.received.amount === 0));
});

test("échéancier borné par la date de fin", () => {
  const items = buildMonthlySchedule({ ...lease, endDate: "2026-10-31" }, "2026-12", "2026-11-19");
  assert.equal(items.length, 2);
});

test("relances J+1, J+5, J+10", () => {
  const plan = reminderPlan("2026-11-13", "2026-11-19");
  assert.deepEqual(plan.map((p) => [p.date, p.sent]), [["2026-11-14", true], ["2026-11-18", true], ["2026-11-23", false]]);
});
