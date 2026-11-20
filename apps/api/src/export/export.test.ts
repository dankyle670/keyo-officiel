import assert from "node:assert/strict";
import { test } from "node:test";
import { parsePreview, previews, privateAddress } from "./previews.ts";
import { tablePdf } from "./table-pdf.ts";

test("adresses internes refusées", () => {
  for (const ip of ["127.0.0.1", "10.2.3.4", "192.168.1.105", "172.20.0.3", "169.254.169.254", "::1", "fd00::1", "::ffff:127.0.0.1", "100.64.0.1"]) assert.equal(privateAddress(ip), true, ip);
  for (const ip of ["8.8.8.8", "172.32.0.1", "2a00:1450::1"]) assert.equal(privateAddress(ip), false, ip);
});

test("aperçu sans lecture du réseau interne", async () => {
  const [p] = await previews(["http://127.0.0.1:3000/agent/status"]);
  assert.deepEqual(p, { url: "http://127.0.0.1:3000/agent/status" });
});

test("balises Open Graph, titre et icône", () => {
  const html = `<html><head><title>Repli</title><meta property="og:title" content="Prix du m² à Cocody &amp; Riviera"><meta property="og:site_name" content="Les Afriques"><meta property="og:image" content="/img/une.jpg"><link rel="icon" href="/logo.svg"><link rel="apple-touch-icon" href="/apple-180.png"></head>`;
  const p = parsePreview(html, new URL("https://lesafriques.com/2026/09/article/"));
  assert.equal(p.title, "Prix du m² à Cocody & Riviera");
  assert.equal(p.site, "Les Afriques");
  assert.equal(p.image, "https://lesafriques.com/img/une.jpg");
  assert.equal(p.icon, "https://lesafriques.com/apple-180.png");
  assert.equal(parsePreview("<title>Seul titre</title>", new URL("https://a.ci/")).icon, "https://a.ci/favicon.ico");
});

test("PDF d'un tableau, sur plusieurs pages si besoin", () => {
  const rows = Array.from({ length: 60 }, (_, i) => [`Logement ${i + 1}`, "88 000 FCFA", "payé"]);
  const pdf = tablePdf({ title: "Loyers de novembre", head: ["Bien", "Loyer", "Statut"], rows: [...rows, ["**Total**", "**5 280 000 FCFA**", ""]], today: "2026-11-20" }).toString("latin1");
  assert.match(pdf, /^%PDF-1\.4/);
  assert.ok(Number(pdf.match(/\/Count (\d+)/)![1]) >= 2);
  assert.ok(pdf.includes("(Total)"));
  assert.ok(!pdf.includes("**"));
});
