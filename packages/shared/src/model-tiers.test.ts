import { test } from "node:test";
import assert from "node:assert/strict";
import { AGENT_TOOLS } from "./agent.ts";
import { maxTier, tierOfTool, TOOL_TIER } from "./model-tiers.ts";

test("chaque outil de l'agent a un palier, aucun palier orphelin", () => {
  assert.deepEqual(Object.keys(TOOL_TIER).sort(), Object.keys(AGENT_TOOLS).sort());
});

test("hiérarchie : lire < agir < engager", () => {
  assert.equal(tierOfTool("get_rents"), "FAST");
  assert.equal(tierOfTool("send_reminder"), "STANDARD");
  assert.equal(tierOfTool("update_lease"), "EXPERT");
  assert.equal(tierOfTool("web_search"), "STANDARD");
  assert.equal(maxTier("FAST", "EXPERT", "STANDARD"), "EXPERT");
  assert.equal(maxTier(), "FAST");
});
