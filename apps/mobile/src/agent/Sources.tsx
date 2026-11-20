import { useState } from "react";
import { Image, Linking, Pressable, ScrollView, View } from "react-native";
import { ChevronDown, ChevronRight, Globe } from "lucide-react-native";
import { color, fontFamily } from "@keyo/tokens";
import { Text } from "@/ui";
import type { LinkPreview } from "./api";
import type { WebSource } from "./conversation";
import { usePreviews } from "./previews";

/**
 * Sources d'une réponse, comme dans Claude : cartes des pages utilisées (image de la page, logo et
 * nom du site, titre), puis la liste de toutes les pages consultées, repliée.
 */
const domainOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};
const open = (url: string) => void Linking.openURL(url).catch(() => undefined);
const titleOf = (w: WebSource, p?: LinkPreview) => (p?.title || (w.title !== w.url ? w.title : "") || domainOf(w.url)).trim();

function Favicon({ uri, size = 16 }: { uri?: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  if (!uri || failed) return <Globe size={size - 2} strokeWidth={1.8} color={color.inkMuted} />;
  return <Image source={{ uri }} onError={() => setFailed(true)} style={{ width: size, height: size, borderRadius: 4, backgroundColor: color.surfaceSoft }} />;
}

function SourceCard({ w, p, n }: { w: WebSource; p?: LinkPreview; n: number }) {
  const [imageFailed, setImageFailed] = useState(false);
  const image = p?.image && !imageFailed ? p.image : undefined;
  return (
    <Pressable
      onPress={() => open(w.url)}
      accessibilityRole="link"
      accessibilityLabel={`Source ${n} : ${titleOf(w, p)}, ${p?.site ?? domainOf(w.url)}`}
      style={({ pressed }) => ({ width: 232, borderRadius: 18, overflow: "hidden", backgroundColor: color.surfaceRaised, borderWidth: 1, borderColor: color.line, opacity: pressed ? 0.75 : 1 })}
    >
      {image ? <Image source={{ uri: image }} onError={() => setImageFailed(true)} resizeMode="cover" style={{ width: "100%", height: 104, backgroundColor: color.surfaceSoft }} /> : null}
      <View style={{ padding: 12, gap: 6, minHeight: image ? undefined : 104 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
          <Favicon uri={p?.icon} />
          <Text variant="caption" tone="inkMuted" numberOfLines={1} style={{ flex: 1 }}>
            {p?.site ?? domainOf(w.url)}
          </Text>
          <View style={{ minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 5, alignItems: "center", justifyContent: "center", backgroundColor: color.surfaceSoft }}>
            <Text variant="caption" tone="inkMuted" style={{ fontSize: 11, lineHeight: 14, fontFamily: fontFamily.semibold }}>
              {n}
            </Text>
          </View>
        </View>
        <Text variant="rowSubtitle" tone="ink" numberOfLines={image ? 2 : 3} style={{ fontFamily: fontFamily.semibold }}>
          {titleOf(w, p)}
        </Text>
        {!image && p?.description ? (
          <Text variant="caption" tone="inkMuted" numberOfLines={2}>
            {p.description}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

export function Sources({ web }: { web: WebSource[] }) {
  const [open_, setOpen] = useState(false);
  const previews = usePreviews(web.map((w) => w.url));
  const used = web.filter((w) => w.cited);
  const cards = used.length ? used : web.slice(0, 4);
  const Chevron = open_ ? ChevronDown : ChevronRight;
  return (
    <View style={{ gap: 10 }}>
      <Text variant="caption" tone="inkMuted" style={{ fontFamily: fontFamily.semibold }}>
        {used.length ? `${used.length} source${used.length > 1 ? "s" : ""} utilisée${used.length > 1 ? "s" : ""}` : "Pages consultées"}
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingRight: 16 }} style={{ marginRight: -16 }}>
        {cards.map((w, i) => (
          <SourceCard key={w.url} w={w} p={previews[w.url]} n={i + 1} />
        ))}
      </ScrollView>
      {web.length > cards.length ? (
        <View>
          <Pressable onPress={() => setOpen((o) => !o)} accessibilityRole="button" accessibilityState={{ expanded: open_ }} hitSlop={8} style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", opacity: pressed ? 0.6 : 1 })}>
            <Text variant="caption" tone="inkMuted" style={{ fontFamily: fontFamily.semibold }}>
              {`${web.length} pages consultées`}
            </Text>
            <Chevron size={15} strokeWidth={1.8} color={color.inkMuted} />
          </Pressable>
          {open_ ? (
            <View style={{ marginTop: 8, borderRadius: 18, backgroundColor: color.surfaceRaised, borderWidth: 1, borderColor: color.line, overflow: "hidden" }}>
              {web.map((w, i) => (
                <Pressable key={w.url} onPress={() => open(w.url)} accessibilityRole="link" style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 11, borderTopWidth: i ? 1 : 0, borderTopColor: color.line, backgroundColor: pressed ? color.surfaceSoft : "transparent" })}>
                  <Favicon uri={previews[w.url]?.icon} />
                  <View style={{ flex: 1 }}>
                    <Text variant="rowSubtitle" tone="ink" numberOfLines={1}>
                      {titleOf(w, previews[w.url])}
                    </Text>
                    <Text variant="caption" tone="inkMuted" numberOfLines={1}>
                      {`${domainOf(w.url)}${w.age ? ` · ${w.age}` : ""}${w.cited ? " · utilisée" : ""}`}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
