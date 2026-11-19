import { test } from "node:test";
import assert from "node:assert/strict";
import { runAudit, type AuditInput } from "./audit.ts";
import { agentToolSchemas, needsConfirmation } from "./agent.ts";
import { money } from "./money.ts";
import type { Agreement, Asset, Document } from "./domain.ts";

const asset = (id: string, country: string): Asset => ({
  id,
  ownerId: "o",
  type: "REAL_ESTATE",
  name: `Bien ${id}`,
  location: { address: "", city: "", country, lat: 0, lng: 0 },
  details: { kind: "HOUSE" },
  currency: country === "CI" ? "XOF" : "EUR",
  createdAt: "2024-01-01T00:00:00.000Z",
});
const lease = (over: Partial<Agreement> = {}): Agreement => ({
  id: "l1",
  assetId: "a1",
  unitId: "u1",
  kind: "LEASE",
  partyId: "p1",
  startDate: "2025-01-01",
  periodicAmount: money(150000, "XOF"),
  deposit: money(300000, "XOF"),
  dueDay: 5,
  period: "MONTHLY",
  ...over,
});
const doc = (kind: Document["kind"], over: Partial<Document> = {}): Document => ({ id: `d-${kind}`, assetId: "a1", kind, label: kind, url: "", createdAt: "2025-01-01T00:00:00.000Z", agreementId: "l1", ...over });

const base = (over: Partial<AuditInput> = {}): AuditInput => ({
  assets: [asset("a1", "CI")],
  units: [{ id: "u1", assetId: "a1", type: "APARTMENT", label: "A1", details: { rooms: 2 } }],
  parties: [{ id: "p1", role: "OCCUPANT", firstName: "Awa", lastName: "K.", phone: "+225" }],
  agreements: [lease()],
  schedule: [],
  events: [],
  documents: [doc("LEASE"), doc("INVENTORY"), doc("TITLE_DEED"), doc("INSURANCE"), doc("REGISTRATION"), doc("TAX_FILING", { year: 2025 })],
  today: "2026-03-10",
  ...over,
});

test("tout est en ordre : aucun point, score 100", () => {
  const r = runAudit(base());
  assert.deepEqual(r.findings, []);
  assert.equal(r.score, 100);
});

test("bail manquant : point grave rattaché au contrat", () => {
  const r = runAudit(base({ documents: base().documents.filter((d) => d.kind !== "LEASE") }));
  const f = r.findings.find((x) => x.id === "doc-lease-l1");
  assert.equal(f?.severity, "HIGH");
  assert.equal(f?.agreementId, "l1");
  assert.ok(f?.fix?.prompt.includes("Awa"));
});

test("fiscalité : déclaration de l'année écoulée et enregistrement du bail en Côte d'Ivoire", () => {
  const r = runAudit(base({ documents: base().documents.filter((d) => d.kind !== "TAX_FILING" && d.kind !== "REGISTRATION") }));
  assert.ok(r.findings.some((f) => f.id === "fiscal-annual-CI-2025"));
  assert.ok(r.findings.some((f) => f.id === "fiscal-registration-l1"));
});

test("pas d'enregistrement exigé hors Côte d'Ivoire", () => {
  const r = runAudit(base({ assets: [asset("a1", "FR")], documents: base().documents.filter((d) => d.kind !== "REGISTRATION") }));
  assert.ok(!r.findings.some((f) => f.area === "FISCAL"));
});

test("retards : une ligne par contrat, grave au-delà de 30 jours", () => {
  const item = (id: string, dueDate: string) => ({ id, agreementId: "l1", dueDate, expected: money(150000, "XOF"), received: money(0, "XOF"), status: "LATE" as const });
  const r = runAudit(base({ schedule: [item("s1", "2026-01-05"), item("s2", "2026-03-05")] }));
  const pay = r.findings.filter((f) => f.area === "PAYMENTS");
  assert.equal(pay.length, 1);
  assert.equal(pay[0]!.severity, "HIGH");
  assert.equal(pay[0]!.title, "2 échéances en retard");
});

test("logement libre, entretien en retard, tri par gravité", () => {
  const r = runAudit(
    base({
      agreements: [lease({ endDate: "2026-02-01" })],
      maintenance: [{ id: "m1", assetId: "a1", label: "Climatisation", everyMonths: 6, nextDueOn: "2026-03-01" }],
    }),
  );
  assert.ok(r.findings.some((f) => f.id === "vacant-u1"));
  assert.equal(r.findings.find((f) => f.id === "maintenance-m1")?.severity, "MEDIUM");
  const ranks = r.findings.map((f) => ({ HIGH: 0, MEDIUM: 1, LOW: 2 })[f.severity]);
  assert.deepEqual(ranks, [...ranks].sort());
});

test("outils de l'agent : schémas JSON objets, confirmation selon le risque", () => {
  const tools = agentToolSchemas();
  assert.ok(tools.length >= 15);
  for (const t of tools) assert.equal(t.input_schema.type, "object");
  assert.equal(needsConfirmation("get_rents", "ALWAYS"), false);
  assert.equal(needsConfirmation("schedule_maintenance", "RISKY"), false);
  assert.equal(needsConfirmation("schedule_maintenance", "ALWAYS"), true);
  assert.equal(needsConfirmation("add_expense", "RISKY"), true);
});

test("véhicule : carte grise attendue, ni état des lieux ni enregistrement", () => {
  const vehicle = { ...asset("a1", "CI"), type: "VEHICLE" as const, details: { kind: "TAXI" } };
  const r = runAudit(base({ assets: [vehicle], documents: [doc("LEASE"), doc("INSURANCE"), doc("TAX_FILING", { year: 2025 })] }));
  assert.ok(!r.findings.some((f) => f.id.startsWith("doc-inventory") || f.id.startsWith("fiscal-registration")));
  assert.equal(r.findings.find((f) => f.id === "doc-title-a1")?.title, "Carte grise non classée");
});
