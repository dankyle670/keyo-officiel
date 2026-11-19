import type { ReactNode } from "react";
import { Pressable, Switch, View } from "react-native";
import { ChevronRight, type LucideIcon } from "lucide-react-native";
import { color, radius, type ColorToken } from "@keyo/tokens";
import { IconCircle } from "./IconCircle";
import { Text } from "./Text";

/** Composants des réglages (Profil), dans l'esprit des Réglages de l'iPhone. */

/** Carte blanche qui regroupe des lignes, séparées par un filet. */
export function SettingsGroup({ title, footer, children }: { title?: string; footer?: string; children: ReactNode }) {
  const rows = (Array.isArray(children) ? children : [children]).filter(Boolean);
  return (
    <View style={{ marginTop: 24 }}>
      {title && (
        <Text variant="caption" tone="inkMuted" style={{ marginLeft: 18, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.8, fontFamily: "PlusJakartaSans_700Bold" }}>
          {title}
        </Text>
      )}
      <View style={{ borderRadius: radius.card, backgroundColor: color.surfaceRaised, paddingHorizontal: 16, overflow: "hidden" }}>
        {rows.map((r, i) => (
          <View key={i} style={{ borderTopWidth: i > 0 ? 1 : 0, borderTopColor: color.line }}>
            {r}
          </View>
        ))}
      </View>
      {footer && (
        <Text variant="caption" tone="inkMuted" style={{ marginHorizontal: 18, marginTop: 8 }}>
          {footer}
        </Text>
      )}
    </View>
  );
}

/** Ligne de navigation vers une rubrique : icône, titre, valeur actuelle, chevron. */
export function NavRow({
  icon,
  tint = "surfaceSoft",
  ink = "ink",
  title,
  value,
  onPress,
}: {
  icon: LucideIcon;
  tint?: ColorToken;
  ink?: ColorToken;
  title: string;
  value?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={value ? `${title}, ${value}` : title}
      style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 14, minHeight: 64, paddingVertical: 10, opacity: pressed ? 0.6 : 1 })}
    >
      <IconCircle icon={icon} bg={tint} fg={ink} diameter={36} />
      <Text variant="rowTitle" style={{ flex: 1 }} numberOfLines={1}>
        {title}
      </Text>
      {value ? (
        <Text variant="rowSubtitle" tone="inkMuted" numberOfLines={1} style={{ maxWidth: "45%" }}>
          {value}
        </Text>
      ) : null}
      <ChevronRight size={20} strokeWidth={1.8} color={color.inkMuted} />
    </Pressable>
  );
}

export function ToggleRow({ title, subtitle, value, onChange }: { title: string; subtitle?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 16, minHeight: 64, paddingVertical: 12 }}>
      <View style={{ flex: 1 }}>
        <Text variant="rowTitle">{title}</Text>
        {subtitle && (
          <Text variant="rowSubtitle" tone="inkMuted">
            {subtitle}
          </Text>
        )}
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: color.mint, false: color.line }} accessibilityLabel={title} />
    </View>
  );
}

/** Ligne d'information non modifiable (téléphone, rôle). */
export function InfoRow({ title, value }: { title: string; value: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 16, minHeight: 56, paddingVertical: 12 }}>
      <Text variant="rowTitle" style={{ flex: 1 }}>
        {title}
      </Text>
      <Text variant="rowSubtitle" tone="inkMuted">
        {value}
      </Text>
    </View>
  );
}

/** Ligne d'action simple (exporter, effacer, se déconnecter). */
export function ActionRow({ title, destructive, onPress }: { title: string; destructive?: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => ({ minHeight: 56, justifyContent: "center", paddingVertical: 12, opacity: pressed ? 0.6 : 1 })}>
      <Text variant="rowTitle" tone={destructive ? "danger" : "ink"}>
        {title}
      </Text>
    </Pressable>
  );
}

/** Choix exclusif en pilule (2 ou 3 options). */
export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string; disabled?: boolean }[]; onChange: (v: T) => void }) {
  return (
    <View style={{ flexDirection: "row", backgroundColor: color.surfaceSoft, borderRadius: 999, padding: 4, gap: 4, marginVertical: 12 }} accessibilityRole="radiogroup">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            disabled={o.disabled}
            onPress={() => onChange(o.value)}
            accessibilityRole="radio"
            accessibilityState={{ checked: active, disabled: o.disabled }}
            style={{ flex: 1, minHeight: 44, borderRadius: 999, alignItems: "center", justifyContent: "center", paddingHorizontal: 8, backgroundColor: active ? color.surfaceRaised : "transparent", opacity: o.disabled ? 0.45 : 1 }}
          >
            <Text variant="rowSubtitle" style={{ fontFamily: active ? "PlusJakartaSans_700Bold" : "PlusJakartaSans_500Medium" }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
