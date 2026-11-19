import { test } from "node:test";
import assert from "node:assert/strict";
import { callParams, routeTurn } from "./router.ts";

const u = (content: string) => ({ role: "user" as const, content });
const a = (text: string) => ({ role: "assistant" as const, content: [{ type: "text", text }] });

test("le modèle suit la nature de la demande", () => {
  assert.equal(routeTurn([u("Bonjour, qui es-tu ?")]).tier, "fast");
  assert.equal(routeTurn([u("Combien de loyers en retard ?")]).tier, "fast");
  assert.equal(routeTurn([u("Relance Awa pour son loyer")]).tier, "standard");
  assert.equal(routeTurn([u("Trouve-moi un plombier près de la villa")]).tier, "standard");
  assert.equal(routeTurn([u("Combien dois-je déclarer aux impôts pour la villa ?")]).tier, "expert");
  assert.equal(routeTurn([u("Quelle est la valeur de ma plantation ?")]).tier, "expert");
  assert.equal(routeTurn([{ role: "user", content: [{ type: "document", source: {} }, { type: "text", text: "classe ce bail" }] }]).tier, "expert");
  assert.equal(routeTurn([{ role: "user", content: [{ type: "image", source: {} }, { type: "text", text: "classe-la" }] }]).tier, "standard");
});

test("une confirmation garde le modèle de la demande qui a préparé l'action", () => {
  const r = routeTurn([u("Analyse la rentabilité de mes biens et propose un plan"), a("Voici… Voulez-vous que je l'applique ?"), u("Oui stp")]);
  assert.equal(r.tier, "expert");
  assert.match(r.reason, /confirmation/);
});

test("le choix reste stable pendant la boucle d'outils d'un même message", () => {
  const first = routeTurn([u("Quelle est la valeur de ma villa ?")]);
  const later = routeTurn([u("Quelle est la valeur de ma villa ?"), { role: "assistant", content: [{ type: "tool_use", id: "t", name: "get_portfolio", input: {} }] }, { role: "user", content: [{ type: "tool_result", tool_use_id: "t", content: "[]" }] }]);
  assert.equal(first.model, later.model);
});

test("Haiku et Sonnet ont Opus comme conseiller ; Haiku sans bascule serveur", () => {
  const fast = routeTurn([u("Bonjour")]);
  assert.equal(fast.model, "claude-haiku-5-5");
  assert.equal(fast.advisor, "claude-opus-5-5");
  assert.equal("fallbacks" in callParams(fast), false);
  const expert = routeTurn([u("Prépare ma déclaration fiscale")]);
  assert.equal(expert.model, "claude-opus-5-5");
  assert.equal(expert.advisor, undefined);
  assert.equal(callParams(expert).fallbacks, "default");
});
