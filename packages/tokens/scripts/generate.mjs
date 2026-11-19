// Génère src/generated.ts à partir de docs/design/tokens.json (source de vérité de la charte).
// Usage : pnpm tokens
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = resolve(here, "../../../docs/design/tokens.json");
const out = resolve(here, "../src/generated.ts");
const json = JSON.parse(readFileSync(src, "utf8"));

const camel = (s) => s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
const px = (v) => Number(String(v).replace("px", ""));

// Couleurs : résout les alias "{night}".
const raw = Object.fromEntries(json.color.tokens.map((t) => [t.name, t.value]));
const resolveColor = (v) => {
  if (typeof v === "string") {
    const m = v.match(/^\{(.+)\}$/);
    return m ? resolveColor(raw[m[1]]) : v;
  }
  return v.light;
};
const color = Object.fromEntries(Object.keys(raw).map((k) => [camel(k), resolveColor(raw[k])]));

const type = {};
for (const g of json.type.groups)
  for (const s of g.styles)
    type[camel(s.name)] = {
      fontSize: px(s.fontSize),
      lineHeight: px(s.lineHeight),
      fontWeight: s.fontWeight,
    };

const spacing = Object.fromEntries(json.spacing.tokens.map((t) => [camel(t.name.replace("space-", "s")), px(t.value)]));
const radius = Object.fromEntries(json.radius.tokens.map((t) => [camel(t.name.replace("radius-", "")), px(t.value)]));

const body = `// Fichier généré par scripts/generate.mjs depuis docs/design/tokens.json. Ne pas modifier à la main.
export const baseColor = ${JSON.stringify(color, null, 2)} as const;

export const baseType = ${JSON.stringify(type, null, 2)} as const;

export const baseSpacing = ${JSON.stringify(spacing, null, 2)} as const;

export const baseRadius = ${JSON.stringify(radius, null, 2)} as const;
`;
writeFileSync(out, body);
console.log(`tokens générés : ${out}`);
