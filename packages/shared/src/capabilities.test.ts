import { test } from "node:test";
import assert from "node:assert/strict";
import { AGENT_TOOLS } from "./agent.ts";
import { AUTONOMOUS_ACTION_KEYS, defaultPolicy } from "./autonomy.ts";
import { capabilities, CAPABILITY_GROUPS } from "./capabilities.ts";

test("le catalogue couvre toutes les actions définies (outils d'écriture et actions autonomes)", () => {
  const listed = new Set<string>(CAPABILITY_GROUPS.flatMap((g) => g.entries.map((e) => ("tool" in e ? e.tool : e.auto))));
  const writes = Object.entries(AGENT_TOOLS).filter(([, d]) => d.kind === "write").map(([k]) => k);
  for (const k of [...writes, ...AUTONOMOUS_ACTION_KEYS]) assert.ok(listed.has(k), `absent du catalogue : ${k}`);
});

test("statut : canal simulé signalé, réglages d'autonomie appliqués", () => {
  const all = (c: ReturnType<typeof capabilities>) => c.flatMap((g) => g.actions);
  const sim = all(capabilities([]));
  assert.equal(sim.find((a) => a.what.startsWith("Relancer seul"))!.status, "READY_SIMULATED");
  assert.equal(sim.find((a) => a.what.startsWith("Créer un bien"))!.status, "READY");
  const live = all(capabilities(["WHATSAPP"], { ...defaultPolicy("XOF"), levels: { send_rent_reminder: "OFF" } }));
  assert.equal(live.find((a) => a.what.startsWith("Relancer seul"))!.status, "OFF");
  assert.equal(live.find((a) => a.what.startsWith("Préparer une mise en demeure"))!.status, "ASKS_YOU");
  assert.equal(all(capabilities(["WHATSAPP"], { ...defaultPolicy("XOF"), enabled: false })).find((a) => a.what.startsWith("Envoyer les quittances"))!.status, "OFF");
});
