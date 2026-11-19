import { test } from "node:test";
import assert from "node:assert/strict";
import type Anthropic from "@anthropic-ai/sdk";
import { defaultPolicy } from "@keyo/shared";
import { ConnectorRegistry, WhatsAppCloudConnector } from "./connectors.ts";
import { ActionGate } from "./gate.ts";
import { Orchestrator, wake } from "./orchestrator.ts";
import { MemoryAgentStore, OwnerSnapshot } from "./store.ts";

const X = (amount: number) => ({ amount, currency: "XOF" as const });
const OWNER = "owner-1";

function snapshot(): OwnerSnapshot {
  // Validé par le vrai schéma : les données de test ont la forme de celles de l'app.
  const loc = { address: "Rue 12", city: "Abidjan", country: "CI", lat: 5.3, lng: -4 };
  return OwnerSnapshot.parse({
    ownerName: "Daniel",
    currency: "XOF",
    assets: [{ id: "a1", ownerId: OWNER, type: "REAL_ESTATE", name: "Villa Cocody", location: loc, currency: "XOF", details: { kind: "HOUSE" }, createdAt: "2025-01-01T00:00:00Z" }],
    units: [
      { id: "u1", assetId: "a1", type: "APARTMENT", label: "Appartement A", details: {} },
      { id: "u2", assetId: "a1", type: "APARTMENT", label: "Appartement B", details: { askingRent: 150000 } },
    ],
    parties: [
      { id: "p1", role: "OCCUPANT", firstName: "Awa", lastName: "Koné", phone: "+2250700000001" },
      { id: "p2", role: "OCCUPANT", firstName: "Yao", lastName: "Kouassi", phone: "+2250700000002" },
      { id: "c1", role: "CRAFTSMAN", firstName: "Ibrahim", lastName: "Traoré", phone: "+2250700000009" },
    ],
    agreements: [
      { id: "g1", assetId: "a1", unitId: "u1", kind: "LEASE", partyId: "p1", startDate: "2025-01-01", periodicAmount: X(200000), dueDay: 5, period: "MONTHLY" },
      { id: "g2", assetId: "a1", unitId: "u1", kind: "LEASE", partyId: "p2", startDate: "2024-01-01", endDate: "2024-12-31", periodicAmount: X(180000), dueDay: 5, period: "MONTHLY" },
    ],
    schedule: [
      { id: "s-late", agreementId: "g1", dueDate: "2026-11-05", expected: X(200000), received: X(50000), status: "PARTIAL" },
      { id: "s-paid", agreementId: "g1", dueDate: "2026-11-18", expected: X(200000), received: X(200000), status: "PAID" },
    ],
    transactions: [],
    events: [
      {
        id: "e1",
        assetId: "a1",
        unitId: "u1",
        kind: "INCIDENT",
        category: "Plomberie",
        title: "Fuite sous l'évier",
        description: "Fuite continue",
        urgency: "MEDIUM",
        status: "QUOTES_PENDING",
        reportedAt: "2026-11-15T10:00:00Z",
        photos: [],
        aiSummary: "Fuite qualifiée",
        quotes: [{ id: "q1", provider: "Ibrahim Traoré", rating: 4.5, slot: "2026-11-21T09:00:00Z", amount: X(80000) }],
      },
    ],
    documents: [],
    shares: [],
  });
}

/** 10 h à Abidjan : hors heures calmes. */
const at = (iso: string) => () => new Date(iso);
function setup(clock = at("2026-11-19T10:00:00Z"), client: Anthropic | null = null) {
  const store = new MemoryAgentStore();
  store.putSnapshot(OWNER, snapshot());
  const gate = new ActionGate(store, new ConnectorRegistry({}), clock);
  return { store, gate, orchestrator: new Orchestrator(store, gate, client, clock) };
}

test("réveil : le code décide qui travailler, et rien à faire = aucun agent", () => {
  const s = snapshot();
  assert.deepEqual(wake("DAILY", s, "2026-11-19").map((w) => w.specialist), ["COLLECTION"]);
  assert.deepEqual(wake("INCIDENT_REPORTED", { ...s, events: [{ ...s.events[0]!, status: "OPEN", aiSummary: undefined }] }, "2026-11-19").map((w) => w.specialist), ["MAINTENANCE"]);
  assert.deepEqual(wake("DAILY", { ...s, schedule: [] }, "2026-11-19"), []);
});

test("sans clé : relance du retard, quittance du paiement, puis rien en double", async () => {
  const { store, orchestrator } = setup();
  const run = await orchestrator.run(OWNER, "DAILY");
  assert.equal(run.engine, "playbook");
  assert.equal(run.status, "DONE");
  // 14 jours de retard : lien de paiement plutôt que simple relance.
  const msgs = store.messages(OWNER);
  assert.equal(msgs.length, 2);
  assert.ok(msgs.every((m) => m.simulated && m.to === "+2250700000001"));
  assert.ok(msgs.some((m) => m.text.includes("https://pay.keyo.app/e/s-late")));
  assert.deepEqual(store.pullMutations(OWNER).map((m) => m.type), ["receipt.issue"]);
  const again = await orchestrator.run(OWNER, "DAILY");
  assert.equal(again.summary, "Rien de nouveau : tout avait déjà été traité.");
  assert.equal(store.messages(OWNER).length, 2);
});

test("le destinataire vient de la fiche, jamais de l'agent ; actions hors catalogue refusées", async () => {
  const { gate } = setup();
  assert.equal((await gate.propose({ ownerId: OWNER, specialist: "COLLECTION", action: "transfer_funds", input: {} })).status, "INVALID");
  assert.equal((await gate.propose({ ownerId: OWNER, specialist: "COLLECTION", action: "send_rent_reminder", input: { scheduleItemId: "s-paid", message: "Payez" } })).status, "INVALID");
  const r = await gate.propose({ ownerId: OWNER, specialist: "COLLECTION", action: "send_rent_reminder", input: { scheduleItemId: "s-late", message: "Bonjour", to: "+33600000000" } });
  assert.equal(r.status, "DONE");
});

test("heures calmes : message différé la nuit, envoyé au passage suivant", async () => {
  let now = new Date("2026-11-19T22:00:00Z");
  const { store, gate } = setup(() => now);
  const r = await gate.propose({ ownerId: OWNER, specialist: "COLLECTION", action: "send_rent_reminder", input: { scheduleItemId: "s-late", message: "Bonjour" } });
  assert.equal(r.status, "DEFERRED");
  assert.equal(store.messages(OWNER).length, 0);
  now = new Date("2026-11-20T09:00:00Z");
  const [flushed] = await gate.flushDeferred(OWNER);
  assert.equal(flushed!.status, "DONE");
  assert.equal(store.messages(OWNER).length, 1);
});

test("dépense : montant lu sur le devis ; au-delà du plafond, accord demandé puis exécution", async () => {
  const { store, gate } = setup();
  store.putPolicy(OWNER, { ...defaultPolicy("XOF"), levels: { approve_quote: "AUTO" }, spendCaps: [X(50000)] });
  const r = await gate.propose({ ownerId: OWNER, specialist: "MAINTENANCE", action: "approve_quote", input: { eventId: "e1", quoteId: "q1", amount: 1 } });
  assert.equal(r.status, "PENDING_APPROVAL");
  assert.equal(store.actions(OWNER, { status: "PENDING_APPROVAL" }).length, 1);
  const ok = await gate.approve(OWNER, (r as { actionId: string }).actionId);
  assert.equal(ok.status, "DONE");
  assert.equal(store.messages(OWNER)[0]!.to, "+2250700000009");
  assert.deepEqual(store.pullMutations(OWNER)[0]!.payload, { eventId: "e1", status: "SCHEDULED", scheduledAt: "2026-11-21T09:00:00Z", acceptedQuoteId: "q1" });
});

test("mise en demeure : toujours soumise à accord, refus consigné ; interrupteur général", async () => {
  const { store, gate } = setup();
  store.putPolicy(OWNER, { ...defaultPolicy("XOF"), levels: { send_formal_notice: "AUTO" } });
  const r = await gate.propose({ ownerId: OWNER, specialist: "COLLECTION", action: "send_formal_notice", input: { scheduleItemId: "s-late", letter: "Madame, ..." } });
  assert.equal(r.status, "PENDING_APPROVAL");
  assert.equal(gate.reject(OWNER, (r as { actionId: string }).actionId).status, "REJECTED");
  store.putPolicy(OWNER, { ...defaultPolicy("XOF"), enabled: false });
  assert.equal((await gate.propose({ ownerId: OWNER, specialist: "COLLECTION", action: "send_receipt", input: { scheduleItemId: "s-paid" } })).status, "BLOCKED");
});

test("annulation : possible tant que l'app n'a pas appliqué la modification", async () => {
  const { store, gate } = setup();
  const s = snapshot();
  store.putSnapshot(OWNER, { ...s, events: [{ ...s.events[0]!, aiSummary: undefined }] });
  const r = (await gate.propose({ ownerId: OWNER, specialist: "MAINTENANCE", action: "triage_incident", input: { eventId: "e1", category: "Plomberie", urgency: "HIGH", summary: "Fuite active" } })) as { actionId: string; status: string };
  assert.equal(r.status, "DONE");
  assert.equal(gate.undo(OWNER, r.actionId).status, "UNDONE");
  assert.equal(store.pullMutations(OWNER).length, 0);
});

/** Faux Claude : rejoue une suite de réponses et garde les requêtes. */
function scripted(replies: Record<string, unknown>[]) {
  const calls: Record<string, any>[] = [];
  const create = async (params: Record<string, unknown>) => {
    calls.push(structuredClone(params));
    return replies.shift() ?? { content: [{ type: "text", text: "Fin." }], stop_reason: "end_turn" };
  };
  return { client: { beta: { messages: { create } } } as unknown as Anthropic, calls };
}

test("avec Claude : le spécialiste lit, agit via le contrôle, ne sort pas de son périmètre", async () => {
  const { client, calls } = scripted([
    { content: [{ type: "tool_use", id: "t1", name: "get_overdue_rents", input: {} }], stop_reason: "tool_use" },
    {
      content: [
        { type: "tool_use", id: "t2", name: "send_rent_reminder", input: { scheduleItemId: "s-late", message: "Bonjour Awa, votre loyer de novembre reste à régler. Keyo, pour le compte de votre propriétaire." } },
        { type: "tool_use", id: "t3", name: "approve_quote", input: { eventId: "e1", quoteId: "q1" } },
      ],
      stop_reason: "tool_use",
    },
    { content: [{ type: "text", text: "Relance envoyée à Awa Koné." }], stop_reason: "end_turn" },
  ]);
  const { store, orchestrator } = setup(at("2026-11-19T10:00:00Z"), client);
  const run = await orchestrator.run(OWNER, "PAYMENT_RECEIVED");
  assert.equal(run.engine, "claude");
  assert.equal(run.summary, "Relance envoyée à Awa Koné.");
  assert.equal(calls.length, 3);
  assert.ok(calls[0]!.tools.every((t: { name: string }) => t.name !== "approve_quote"));
  const results = calls[2]!.messages.at(-1).content;
  assert.match(results[0].content, /"status":"DONE"/);
  assert.equal(results[1].is_error, true);
  assert.equal(store.messages(OWNER).length, 1);
  assert.equal(store.actions(OWNER).length, 1);
});

test("avec Claude : plusieurs domaines = le Gérant délègue", async () => {
  const { client, calls } = scripted([
    { content: [{ type: "tool_use", id: "d1", name: "delegate", input: { specialist: "COLLECTION", task: "Relancer les retards" } }], stop_reason: "tool_use" },
    { content: [{ type: "text", text: "Rien à relancer." }], stop_reason: "end_turn" },
    { content: [{ type: "text", text: "Compte rendu du Gérant." }], stop_reason: "end_turn" },
  ]);
  const { orchestrator } = setup(at("2026-11-19T10:00:00Z"), client);
  const run = await orchestrator.run(OWNER, "MANUAL");
  assert.equal(run.summary, "Compte rendu du Gérant.");
  assert.equal(calls[0]!.tools[0].name, "delegate");
  assert.deepEqual(calls[0]!.tools[0].input_schema.properties.specialist.enum, ["COLLECTION", "RELETTING", "COMPLIANCE"]);
  assert.match(calls[1]!.system[0].text, /Encaissement/);
});

test("WhatsApp : requête à l'API Cloud, numéro nettoyé ; refus remonté", async () => {
  const sent: { url: string; body: any }[] = [];
  const http = (async (url: string, init: RequestInit) => {
    sent.push({ url, body: JSON.parse(String(init.body)) });
    return new Response(JSON.stringify({ messages: [{ id: "wamid.1" }] }), { status: 200 });
  }) as typeof fetch;
  const wa = new WhatsAppCloudConnector("tok", "123", undefined, http);
  assert.deepEqual(await wa.send({ channel: "WHATSAPP", to: "+225 07 00 00 00 01", text: "Bonjour" }), { ok: true, simulated: false, providerId: "wamid.1" });
  assert.equal(sent[0]!.url, "https://graph.facebook.com/v21.0/123/messages");
  assert.equal(sent[0]!.body.to, "2250700000001");
  const registry = new ConnectorRegistry({ WHATSAPP_TOKEN: "t", WHATSAPP_PHONE_NUMBER_ID: "1" });
  assert.equal(registry.get("WHATSAPP").simulated, false);
  assert.equal(registry.get("SMS").simulated, true);
  const refused = new WhatsAppCloudConnector("tok", "123", undefined, (async () => new Response("{}", { status: 401 })) as typeof fetch);
  assert.equal((await refused.send({ channel: "WHATSAPP", to: "+1", text: "x" })).ok, false);
});
