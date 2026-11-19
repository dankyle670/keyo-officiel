import { test } from "node:test";
import assert from "node:assert/strict";
import type Anthropic from "@anthropic-ai/sdk";
import { AgentService, MODEL } from "./agent.service.ts";

const context = { today: "2026-11-19", currency: "XOF", ownerName: "Daniel" };

/** Faux client : enregistre la requête, renvoie une réponse fixe. Aucun appel réseau. */
function fakeClient(reply: Record<string, unknown>) {
  const calls: Record<string, any>[] = [];
  const handler = async (params: Record<string, unknown>) => {
    calls.push(params);
    return reply;
  };
  const client = { beta: { messages: { create: handler, parse: handler } } } as unknown as Anthropic;
  return { client, calls };
}

test("sans clé : mode démo, aucun appel", async () => {
  const svc = new AgentService(null);
  assert.equal(svc.status().mode, "demo");
  assert.equal(await svc.turn({ messages: [{ role: "user", content: "Bonjour" }], context }), null);
});

test("tour : modèle, outils mis en cache, repli serveur, historique transmis tel quel", async () => {
  const { client, calls } = fakeClient({ content: [{ type: "text", text: "Bonjour" }], stop_reason: "end_turn", model: MODEL });
  const svc = new AgentService(client);
  const history = [
    { role: "user" as const, content: "Mes loyers ?" },
    { role: "assistant" as const, content: [{ type: "thinking", thinking: "", signature: "sig" }, { type: "tool_use", id: "t1", name: "get_rents", input: {} }] },
    { role: "user" as const, content: [{ type: "tool_result", tool_use_id: "t1", content: "[]" }] },
  ];
  const res = await svc.turn({ messages: history, context });
  assert.equal(res?.stop_reason, "end_turn");
  const p = calls[0]!;
  assert.equal(p.model, "claude-opus-5-5");
  assert.deepEqual(p.thinking, { type: "adaptive" });
  assert.equal(p.fallbacks, "default");
  assert.deepEqual(p.messages, history);
  assert.ok(p.tools.length >= 15);
  assert.deepEqual(p.tools.at(-1).cache_control, { type: "ephemeral" });
  assert.equal(p.tools.filter((t: any) => t.cache_control).length, 1);
  assert.ok(p.system[1].text.includes("2026-11-19"));
  assert.ok(!p.system[0].text.includes("2026"), "le bloc mis en cache ne contient rien de variable");
});

test("ops : sans point, pas d'appel ; ne garde que les points réellement relevés", async () => {
  const { client, calls } = fakeClient({
    stop_reason: "end_turn",
    parsed_output: {
      verdict: "Deux points à traiter.",
      priorities: [
        { findingId: "pay-l1", why: "Argent non encaissé", nextStep: "Relancer" },
        { findingId: "invente", why: "x", nextStep: "y" },
      ],
    },
  });
  const svc = new AgentService(client);
  const empty = await svc.ops({ findings: [], score: 100, context });
  assert.equal(empty?.priorities.length, 0);
  assert.equal(calls.length, 0);
  const r = await svc.ops({ findings: [{ id: "pay-l1", severity: "HIGH", area: "PAYMENTS", title: "Retard", detail: "Awa" }], score: 85, context });
  assert.deepEqual(r?.priorities.map((p) => p.findingId), ["pay-l1"]);
});

test("ops : un refus du modèle renvoie null (l'app affiche le contrôle brut)", async () => {
  const { client } = fakeClient({ stop_reason: "refusal", parsed_output: null });
  const r = await new AgentService(client).ops({ findings: [{ id: "a", severity: "LOW", area: "X", title: "t", detail: "d" }], score: 98, context });
  assert.equal(r, null);
});
