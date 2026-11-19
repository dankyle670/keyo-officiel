import { Text as RNText, View } from "react-native";
import { fontFamily } from "@keyo/tokens";
import { Text } from "./Text";

/**
 * Mise en forme légère des réponses de l'agent : titres, listes à puces ou numérotées, gras.
 * Volontairement limitée à ce que l'agent écrit (réponses courtes pour un téléphone).
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

type Block = { kind: "p" | "h" | "li" | "ol"; text: string; n?: string };

function blocks(src: string): Block[] {
  const out: Block[] = [];
  for (const raw of src.split("\n")) {
    const line = raw.trimEnd();
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

export function Markdown({ text }: { text: string }) {
  return (
    <View style={{ gap: 4 }}>
      {blocks(text).map((b, i) => {
        if (!b.text) return <View key={i} style={{ height: 6 }} />;
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
