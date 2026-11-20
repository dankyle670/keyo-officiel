import { Linking, ScrollView, Text as RNText, View } from "react-native";
import { color, fontFamily } from "@keyo/tokens";
import { Text } from "./Text";

/**
 * Mise en forme des réponses de l'agent, comme dans ChatGPT ou Claude (Markdown) : titres, gras,
 * italique, code, liens cliquables, listes (imbriquées), citations, blocs de code, séparateurs et
 * tableaux. `streaming` : texte en cours d'apparition ; un tableau inachevé n'est pas montré brut.
 */
const MONO = "Menlo";

const open = (url: string) => void Linking.openURL(/^https?:\/\//.test(url) ? url : `https://${url}`).catch(() => undefined);

/** Gras, italique, code, liens [texte](url) et adresses web. */
function Inline({ text }: { text: string }) {
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\)|https?:\/\/[^\s)]+|\*[^*\s][^*]*\*(?!\*)|_[^_\s][^_]*_(?=[\s.,;:!?)]|$))/g;
  const parts = text.split(re).filter((p) => p !== undefined && p !== "");
  return (
    <>
      {parts.map((p, i) => {
        if (p.startsWith("**") && p.endsWith("**") && p.length > 4)
          return (
            <RNText key={i} style={{ fontFamily: fontFamily.bold }}>
              {p.slice(2, -2)}
            </RNText>
          );
        if (p.startsWith("`") && p.endsWith("`") && p.length > 2)
          return (
            <RNText key={i} style={{ fontFamily: MONO, fontSize: 14, backgroundColor: color.surfaceSoft }}>
              {` ${p.slice(1, -1)} `}
            </RNText>
          );
        const link = p.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/);
        if (link)
          return (
            <RNText key={i} style={{ color: color.mintDeep, textDecorationLine: "underline" }} onPress={() => open(link[2]!)} accessibilityRole="link">
              {link[1]}
            </RNText>
          );
        if (/^https?:\/\//.test(p))
          return (
            <RNText key={i} style={{ color: color.mintDeep, textDecorationLine: "underline" }} onPress={() => open(p)} accessibilityRole="link">
              {p.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}
            </RNText>
          );
        if (p.length > 2 && ((p.startsWith("*") && p.endsWith("*")) || (p.startsWith("_") && p.endsWith("_"))))
          return (
            <RNText key={i} style={{ fontStyle: "italic" }}>
              {p.slice(1, -1)}
            </RNText>
          );
        return p;
      })}
    </>
  );
}

type Block =
  | { kind: "p" | "h1" | "h2" | "h3" | "quote"; text: string }
  | { kind: "li" | "ol"; text: string; n?: string; depth: number }
  | { kind: "hr" | "gap" }
  | { kind: "code"; text: string }
  | { kind: "table"; head: string[]; rows: string[][] };

const isTableLine = (l: string) => /^\s*\|.*\|\s*$/.test(l);
const isSeparator = (l: string) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l);
const cells = (l: string) =>
  l
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());

export function parseMarkdown(src: string, streaming = false): Block[] {
  const out: Block[] = [];
  const lines = src.replace(/\r/g, "").split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trimEnd();
    // Bloc de code ``` … ``` (affiché même s'il n'est pas encore refermé).
    if (/^\s*```/.test(line)) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^\s*```/.test(lines[i]!)) body.push(lines[i++]!);
      out.push({ kind: "code", text: body.join("\n") });
      continue;
    }
    // Tableau : en-tête, séparation |---|, puis les lignes.
    if (isTableLine(line) && i + 1 < lines.length && isSeparator(lines[i + 1]!)) {
      const head = cells(line);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && isTableLine(lines[i]!)) rows.push(cells(lines[i++]!));
      i--;
      out.push({ kind: "table", head, rows: rows.map((r) => head.map((_, k) => r[k] ?? "")) });
      continue;
    }
    // Pendant l'écriture : une ligne de tableau pas encore complète n'est pas montrée brute.
    if (streaming && /^\s*\|/.test(line)) continue;
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      out.push({ kind: "hr" });
      continue;
    }
    if (!line.trim()) {
      out.push({ kind: "gap" });
      continue;
    }
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    const quote = line.match(/^\s*>\s?(.*)$/);
    const li = line.match(/^(\s*)[-*•+]\s+(?:\[[ xX]\]\s+)?(.*)$/);
    const ol = line.match(/^(\s*)(\d+)[.)]\s+(.*)$/);
    const depth = (indent: string) => Math.min(3, Math.floor(indent.replace(/\t/g, "  ").length / 2));
    if (h) out.push({ kind: h[1]!.length === 1 ? "h1" : h[1]!.length === 2 ? "h2" : "h3", text: h[2]! });
    else if (quote) out.push({ kind: "quote", text: quote[1]! });
    else if (li) out.push({ kind: "li", text: li[2]!, depth: depth(li[1]!) });
    else if (ol) out.push({ kind: "ol", text: ol[3]!, n: ol[2], depth: depth(ol[1]!) });
    else out.push({ kind: "p", text: line.trim() });
  }
  // Pas d'espaces vides en tête, en fin ni en double.
  return out.filter((b, i, all) => b.kind !== "gap" || (i > 0 && i < all.length - 1 && all[i - 1]!.kind !== "gap"));
}

/** Colonne numérique (montants, pourcentages) : alignée à droite, chiffres tabulaires. */
const numeric = (rows: string[][], k: number) => rows.some((r) => r[k]) && rows.every((r) => !r[k] || /^[\s*~≈<>+−-]*\d/.test(r[k]!.replace(/\*\*/g, "")));

function Table({ head, rows }: { head: string[]; rows: string[][] }) {
  const width = (k: number) => {
    const longest = Math.max(...[head[k] ?? "", ...rows.map((r) => r[k] ?? "")].map((t) => t.replace(/\*\*|`/g, "").length));
    return Math.min(220, Math.max(72, longest * 7.6 + 28));
  };
  const widths = head.map((_, k) => width(k));
  const right = head.map((_, k) => numeric(rows, k));
  const cell = (t: string, k: number, bold: boolean) => (
    <View key={k} style={{ width: widths[k], paddingHorizontal: 12, paddingVertical: 10, justifyContent: "center" }}>
      <Text variant={bold ? "rowTitle" : "rowSubtitle"} tone="ink" selectable style={{ textAlign: right[k] ? "right" : "left", fontVariant: right[k] ? ["tabular-nums"] : undefined, fontSize: 14, lineHeight: 20 }}>
        <Inline text={t} />
      </Text>
    </View>
  );
  return (
    <View style={{ marginVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: color.line, overflow: "hidden", backgroundColor: color.surfaceRaised }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} bounces={false}>
        <View>
          <View style={{ flexDirection: "row", backgroundColor: color.surfaceSoft }}>{head.map((h, k) => cell(h, k, true))}</View>
          {rows.map((r, j) => (
            <View key={j} style={{ flexDirection: "row", borderTopWidth: 1, borderTopColor: color.line }}>
              {r.map((t, k) => cell(t, k, false))}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

export function Markdown({ text, streaming = false }: { text: string; streaming?: boolean }) {
  return (
    <View style={{ gap: 4 }}>
      {parseMarkdown(text, streaming).map((b, i) => {
        switch (b.kind) {
          case "gap":
            return <View key={i} style={{ height: 6 }} />;
          case "hr":
            return <View key={i} style={{ height: 1, backgroundColor: color.line, marginVertical: 8 }} />;
          case "table":
            return <Table key={i} head={b.head} rows={b.rows} />;
          case "code":
            return (
              <ScrollView key={i} horizontal showsHorizontalScrollIndicator={false} style={{ marginVertical: 6, borderRadius: 14, backgroundColor: color.surfaceSoft }} contentContainerStyle={{ padding: 14 }}>
                <RNText selectable style={{ fontFamily: MONO, fontSize: 13, lineHeight: 19, color: color.ink }}>
                  {b.text}
                </RNText>
              </ScrollView>
            );
          case "h1":
          case "h2":
          case "h3":
            return (
              <Text key={i} variant={b.kind === "h3" ? "rowTitle" : "section"} selectable style={{ marginTop: i ? 8 : 0 }}>
                <Inline text={b.text} />
              </Text>
            );
          case "quote":
            return (
              <View key={i} style={{ flexDirection: "row", gap: 10 }}>
                <View style={{ width: 3, borderRadius: 3, backgroundColor: color.line }} />
                <Text variant="body" tone="inkMuted" selectable style={{ flex: 1, lineHeight: 24 }}>
                  <Inline text={b.text} />
                </Text>
              </View>
            );
          case "li":
          case "ol":
            return (
              <View key={i} style={{ flexDirection: "row", gap: 8, paddingLeft: 2 + b.depth * 18 }}>
                <Text variant="body" tone="inkMuted" style={{ lineHeight: 24, minWidth: b.kind === "ol" ? 18 : 10 }}>
                  {b.kind === "ol" ? `${b.n}.` : b.depth ? "◦" : "•"}
                </Text>
                <Text variant="body" selectable style={{ flex: 1, lineHeight: 24 }}>
                  <Inline text={b.text} />
                </Text>
              </View>
            );
          default:
            return (
              <Text key={i} variant="body" selectable style={{ lineHeight: 24 }}>
                <Inline text={b.text} />
              </Text>
            );
        }
      })}
    </View>
  );
}
