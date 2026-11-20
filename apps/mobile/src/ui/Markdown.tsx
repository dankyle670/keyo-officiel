import { ScrollView, Text as RNText, View } from "react-native";
import { color, fontFamily } from "@keyo/tokens";
import { Text } from "./Text";

/**
 * Mise en forme des réponses de l'agent, comme dans ChatGPT ou Claude : titres, listes à puces ou
 * numérotées, gras, séparateurs et tableaux (Markdown).
 */
function Inline({ text }: { text: string }) {
  const parts = text.replace(/`([^`]+)`/g, "$1").split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("**") && p.endsWith("**") && p.length > 4 ? (
          <RNText key={i} style={{ fontFamily: fontFamily.bold }}>
            {p.slice(2, -2)}
          </RNText>
        ) : (
          p.replace(/(^|\s)\*([^*\s][^*]*)\*(?=\s|$|[.,;:!?])/g, "$1$2")
        ),
      )}
    </>
  );
}

type Block = { kind: "p" | "h" | "li" | "ol" | "hr"; text: string; n?: string } | { kind: "table"; text: string; head: string[]; rows: string[][] };

const isTableLine = (l: string) => /^\s*\|.*\|\s*$/.test(l);
const isSeparator = (l: string) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l);
const cells = (l: string) =>
  l
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());

function blocks(src: string): Block[] {
  const out: Block[] = [];
  const lines = src.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trimEnd();
    // Tableau : ligne d'en-tête, ligne de séparation |---|, puis les lignes.
    if (isTableLine(line) && i + 1 < lines.length && isSeparator(lines[i + 1]!)) {
      const head = cells(line);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && isTableLine(lines[i]!)) rows.push(cells(lines[i++]!));
      i--;
      out.push({ kind: "table", text: "table", head, rows: rows.map((r) => head.map((_, k) => r[k] ?? "")) });
      continue;
    }
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      out.push({ kind: "hr", text: "hr" });
      continue;
    }
    if (!line.trim()) {
      out.push({ kind: "p", text: "" });
      continue;
    }
    const h = line.match(/^#{1,4}\s+(.*)$/);
    const li = line.match(/^\s*[-*•]\s+(.*)$/);
    const ol = line.match(/^\s*(\d+)[.)]\s+(.*)$/);
    if (h) out.push({ kind: "h", text: h[1]! });
    else if (li) out.push({ kind: "li", text: li[1]! });
    else if (ol) out.push({ kind: "ol", text: ol[2]!, n: ol[1] });
    else out.push({ kind: "p", text: line });
  }
  // Pas d'espaces vides en tête, en fin ni en double.
  return out.filter((b, i, all) => b.text || (i > 0 && i < all.length - 1 && all[i - 1]!.text !== ""));
}

/** Colonne numérique (montants, pourcentages) : alignée à droite, chiffres tabulaires. */
const numeric = (rows: string[][], k: number) => rows.filter((r) => r[k]).length > 0 && rows.every((r) => !r[k] || /^[\s*~≈<>+−-]*\d/.test(r[k]!.replace(/\*\*/g, "")));

function Table({ head, rows }: { head: string[]; rows: string[][] }) {
  const width = (k: number) => {
    const longest = Math.max(...[head[k] ?? "", ...rows.map((r) => r[k] ?? "")].map((t) => t.replace(/\*\*/g, "").length));
    return Math.min(220, Math.max(72, longest * 7.6 + 28));
  };
  const widths = head.map((_, k) => width(k));
  const right = head.map((_, k) => numeric(rows, k));
  const cell = (t: string, k: number, bold: boolean, key: number) => (
    <View key={key} style={{ width: widths[k], paddingHorizontal: 12, paddingVertical: 10, justifyContent: "center" }}>
      <Text variant={bold ? "rowTitle" : "rowSubtitle"} tone="ink" selectable style={{ textAlign: right[k] ? "right" : "left", fontVariant: right[k] ? ["tabular-nums"] : undefined, fontSize: 14, lineHeight: 20 }}>
        <Inline text={t} />
      </Text>
    </View>
  );
  return (
    <View style={{ marginVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: color.line, overflow: "hidden", backgroundColor: color.surfaceRaised }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} bounces={false}>
        <View>
          <View style={{ flexDirection: "row", backgroundColor: color.surfaceSoft }}>{head.map((h, k) => cell(h, k, true, k))}</View>
          {rows.map((r, j) => (
            <View key={j} style={{ flexDirection: "row", borderTopWidth: 1, borderTopColor: color.line }}>
              {r.map((t, k) => cell(t, k, false, k))}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

export function Markdown({ text }: { text: string }) {
  return (
    <View style={{ gap: 4 }}>
      {blocks(text).map((b, i) => {
        if (!b.text) return <View key={i} style={{ height: 6 }} />;
        if (b.kind === "table") return <Table key={i} head={b.head} rows={b.rows} />;
        if (b.kind === "hr") return <View key={i} style={{ height: 1, backgroundColor: color.line, marginVertical: 8 }} />;
        if (b.kind === "h")
          return (
            <Text key={i} variant="rowTitle" selectable style={{ marginTop: i ? 6 : 0 }}>
              <Inline text={b.text} />
            </Text>
          );
        if (b.kind === "li" || b.kind === "ol")
          return (
            <View key={i} style={{ flexDirection: "row", gap: 8, paddingLeft: 2 }}>
              <Text variant="body" tone="inkMuted" style={{ lineHeight: 24, minWidth: b.kind === "ol" ? 18 : 10 }}>
                {b.kind === "ol" ? `${b.n}.` : "•"}
              </Text>
              <Text variant="body" selectable style={{ flex: 1, lineHeight: 24 }}>
                <Inline text={b.text} />
              </Text>
            </View>
          );
        return (
          <Text key={i} variant="body" selectable style={{ lineHeight: 24 }}>
            <Inline text={b.text} />
          </Text>
        );
      })}
    </View>
  );
}
