import assert from "node:assert/strict";
import { test } from "node:test";
import { numberToFrench, speechChunks, spokenLine } from "./speech.ts";

test("nombres en toutes lettres", () => {
  const cases: [number, string][] = [
    [0, "zéro"],
    [17, "dix-sept"],
    [21, "vingt et un"],
    [71, "soixante et onze"],
    [80, "quatre-vingts"],
    [81, "quatre-vingt-un"],
    [91, "quatre-vingt-onze"],
    [100, "cent"],
    [200, "deux cents"],
    [201, "deux cent un"],
    [1000, "mille"],
    [80_000, "quatre-vingt mille"],
    [200_000, "deux cent mille"],
    [2026, "deux mille vingt-six"],
    [1_000_000, "un million"],
    [200_000_000, "deux cents millions"],
    [80_000_000, "quatre-vingts millions"],
    [641_000_000, "six cent quarante et un millions"],
    [1_092_200_000, "un milliard quatre-vingt-douze millions deux cent mille"],
  ];
  for (const [n, w] of cases) assert.equal(numberToFrench(n), w, String(n));
});

test("montants, pourcentages et unités", () => {
  assert.equal(spokenLine("Total : **1 092 200 000 FCFA**"), "Total : un milliard quatre-vingt-douze millions deux cent mille francs CFA");
  assert.equal(spokenLine("641 000 000 FCFA"), "six cent quarante et un millions de francs CFA");
  assert.equal(spokenLine("de 31,1 à 39,5 M"), "de trente et un virgule un à trente-neuf virgule cinq millions");
  assert.equal(spokenLine("rendement de 12,6 %"), "rendement de douze virgule six pour cent");
  assert.equal(spokenLine("45,50 €"), "quarante-cinq virgule cinquante euros");
  assert.equal(spokenLine("50 m² au 3e étage"), "cinquante mètres carrés au troisième étage");
  assert.equal(spokenLine("voir [Les Afriques](https://lesafriques.com/x)"), "voir Les Afriques");
});

test("tableau lu ligne par ligne, mise en forme retirée", () => {
  const md = "### Vos biens\n\n| Bien | Valeur | Fiabilité |\n|---|---|---|\n| Villa | 641 000 000 FCFA | faible |\n| **Total** | **676 300 000 FCFA** | |\n\n- Point un\n- Point deux\n\nSources : portefeuille.";
  assert.deepEqual(speechChunks(md), [
    "Vos biens.",
    "Villa : valeur, six cent quarante et un millions de francs CFA ; fiabilité, faible.",
    "Total : valeur, six cent soixante-seize millions trois cent mille francs CFA.",
    "Point un.",
    "Point deux.",
  ]);
});
