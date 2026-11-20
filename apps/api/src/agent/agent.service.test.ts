import { test } from "node:test";
import assert from "node:assert/strict";
import type Anthropic from "@anthropic-ai/sdk";
import { AgentService } from "./agent.service.ts";

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
  const { client, calls } = fakeClient({ content: [{ type: "text", text: "Bonjour" }], stop_reason: "end_turn", model: "claude-sonnet-5-5" });
  const svc = new AgentService(client);
  const history = [
    { role: "user" as const, content: "Mes loyers ?" },
    { role: "assistant" as const, content: [{ type: "thinking", thinking: "", signature: "sig" }, { type: "tool_use", id: "t1", name: "get_rents", input: {} }] },
    { role: "user" as const, content: [{ type: "tool_result", tool_use_id: "t1", content: "[]" }] },
  ];
  const res = await svc.turn({ messages: history, context });
  assert.equal(res?.stop_reason, "end_turn");
  const p = calls[0]!;
  // Demande en cours qui n'a lu que des loyers : palier léger (Haiku), sans bascule serveur.
  assert.equal(p.model, "claude-haiku-5-5");
  assert.equal(res?.tier, "FAST");
  assert.ok(p.tools.some((t: any) => t.name === "switch_model"));
  assert.deepEqual(p.thinking, { type: "adaptive", block_binding: { prefix_mismatch_behavior: "drop_block" } });
  // Historique transmis tel quel, avec un point de cache sur le dernier bloc (relu à moindre coût).
  assert.deepEqual(p.messages.slice(0, -1), history.slice(0, -1));
  const lastSent = p.messages.at(-1).content.at(-1);
  assert.deepEqual(lastSent.cache_control, { type: "ephemeral" });
  const { cache_control: _, ...rest } = lastSent;
  assert.deepEqual(rest, (history.at(-1)!.content as any[]).at(-1));
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

test("abonnement : lecture seule bloque l'agent ; analyse d'expert hors quota demande l'accord, puis est facturée", async () => {
  // Haiku choisit une expertise (palier Opus) ; Opus répond.
  const replies = [
    { content: [{ type: "tool_use", id: "t1", name: "get_valuation", input: {} }], stop_reason: "tool_use", model: "claude-haiku-5-5", usage: { input_tokens: 10, output_tokens: 5 } },
    { content: [{ type: "text", text: "Estimation" }], stop_reason: "end_turn", model: "claude-opus-5-5", usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 1000 } },
  ];
  let n = 0;
  const client = { beta: { messages: { create: async () => replies[n++ % 2] } } } as unknown as Anthropic;
  const usage: { tier: string; expert: boolean; extraBilled: boolean; costMicroUsd: number }[] = [];
  let allowed = true;
  const billing = {
    agentAllowed: async () => allowed,
    expertAllowance: async () => ({ remaining: 0, included: 3, extraPrice: { amount: 1000, currency: "XOF" } }),
    recordUsage: async (u: any) => void usage.push(u),
  };
  const svc = new AgentService(client, billing as any);
  const body = { messages: [{ role: "user" as const, content: "Combien vaut ma villa ?" }], context };

  const asked = await svc.turn(body, "proprio");
  assert.equal(asked?.stop_reason, "expert_quota", "quota épuisé : on demande l'accord avant Opus");
  assert.equal(usage.length, 1, "seul l'appel Haiku a été fait");

  n = 0;
  const ok = await svc.turn({ ...body, expertConsent: true }, "proprio");
  assert.equal(ok?.stop_reason, "end_turn");
  const opus = usage.at(-1)!;
  assert.equal(opus.tier, "EXPERT");
  assert.ok(opus.expert && opus.extraBilled);
  // 10 × 4 + 5 × 20 + 1000 × 0,2 = 340 millionièmes de dollar
  assert.equal(opus.costMicroUsd, 340);

  allowed = false;
  const locked = await svc.turn(body, "proprio");
  assert.ok(locked && "locked" in locked && locked.locked);
});
