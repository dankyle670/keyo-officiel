import { test } from "node:test";
import assert from "node:assert/strict";
import { callParams, requiredTier, startTier } from "./router.ts";
import { AgentService } from "./agent.service.ts";

const tu = (name: string, input: unknown = {}) => ({ type: "tool_use", id: name, name, input });

test("le palier exigé suit l'action choisie par l'agent", () => {
  assert.equal(requiredTier([{ type: "text" }]).tier, "FAST");
  assert.equal(requiredTier([tu("get_rents")]).tier, "FAST");
  assert.equal(requiredTier([tu("get_rents"), tu("send_reminder")]).tier, "STANDARD");
  assert.equal(requiredTier([tu("update_lease")]).tier, "EXPERT");
  assert.equal(requiredTier([{ type: "server_tool_use", name: "web_search" }]).tier, "STANDARD");
  assert.equal(requiredTier([tu("switch_model", { tier: "EXPERT", reason: "fiscalité" })]).reason, "fiscalité");
});

test("le palier ne redescend pas pendant une demande, et repart léger à la suivante", () => {
  const during = [
    { role: "user" as const, content: "Modifie le bail" },
    { role: "assistant" as const, content: [tu("update_lease")] },
    { role: "user" as const, content: [{ type: "tool_result", tool_use_id: "update_lease" }] },
  ];
  assert.equal(startTier(during), "EXPERT");
  assert.equal(startTier([...during, { role: "assistant", content: [{ type: "text" }] }, { role: "user", content: "Bonjour" }]), "FAST");
  assert.equal(startTier([{ role: "user", content: "x" }], "STANDARD"), "STANDARD");
});

test("Haiku sans bascule serveur ; réflexion illisible écartée plutôt qu'une erreur", () => {
  assert.deepEqual(callParams("FAST").thinking.block_binding, { prefix_mismatch_behavior: "drop_block" });
  assert.ok(callParams("FAST").betas.includes("thinking-binding-controls-2026-08-01"));
  assert.equal("fallbacks" in callParams("FAST"), false);
  assert.equal(callParams("EXPERT").model, "claude-opus-5-5");
});

test("l'agent choisit une action experte sur Haiku : l'étape est reprise par Opus", async () => {
  const calls: any[] = [];
  const replies = [
    { content: [tu("update_lease", { agreementId: "g1" })], stop_reason: "tool_use", model: "claude-haiku-5-5" },
    { content: [tu("update_lease", { agreementId: "g1" })], stop_reason: "tool_use", model: "claude-opus-5-5" },
  ];
  const client = { beta: { messages: { create: async (p: any) => (calls.push(p), replies.shift()) } } } as any;
  const res = await new AgentService(client).turn({ messages: [{ role: "user", content: "Passe le loyer de Awa à 220 000" }], context: { today: "2026-11-19", currency: "XOF" } });
  assert.deepEqual(calls.map((c) => c.model), ["claude-haiku-5-5", "claude-opus-5-5"]);
  assert.equal(res?.tier, "EXPERT");
  assert.equal(res?.model, "claude-opus-5-5");
  // Mêmes outils et même système pour les deux modèles : l'historique reste valide.
  assert.deepEqual(calls[0].tools, calls[1].tools);
  assert.deepEqual(calls[0].system, calls[1].system);
});
