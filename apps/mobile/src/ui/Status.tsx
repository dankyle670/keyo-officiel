import { View } from "react-native";
import type { StatusTone } from "@keyo/shared";
import { color, size, type ColorToken } from "@keyo/tokens";
import { Text } from "./Text";

const DOT: Record<StatusTone, string> = {
  paid: color.dotPaid,
  late: color.dotLate,
  danger: color.dotDanger,
  info: color.sky,
  neutral: color.track,
};
const LABEL: Record<StatusTone, ColorToken> = {
  paid: "mintDeep",
  late: "amber",
  danger: "danger",
  info: "sky",
  neutral: "inkMuted",
};

/** Statut : point de 7 px suivi d'un mot. La couleur seule ne suffit jamais. */
export function Status({ tone, label }: { tone: StatusTone; label: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }} accessibilityLabel={label}>
      <View style={{ width: size.statusDot, height: size.statusDot, borderRadius: size.statusDot, backgroundColor: DOT[tone] }} />
      <Text variant="status" tone={LABEL[tone]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/** Étiquette blanche en pilule, posée sur la carte (« ● 1 retard »). */
export function MapTag({ tone, label }: { tone: StatusTone; label: string }) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        backgroundColor: color.surfaceRaised,
        borderRadius: 999,
        paddingHorizontal: 14,
        height: 34,
        shadowColor: color.night,
        shadowOpacity: 0.12,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 4 },
      }}
    >
      <View style={{ width: 8, height: 8, borderRadius: 8, backgroundColor: DOT[tone] }} />
      <Text variant="rowTitle" style={{ fontSize: 14 }}>
        {label}
      </Text>
    </View>
  );
}
