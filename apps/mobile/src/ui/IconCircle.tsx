import { View } from "react-native";
import type { LucideIcon } from "lucide-react-native";
import { color, size, type ColorToken } from "@keyo/tokens";
import { Text } from "./Text";

type Props = { bg?: ColorToken; fg?: ColorToken; diameter?: number } & (
  | { icon: LucideIcon; initials?: never }
  | { initials: string; icon?: never }
);

/** Icône ou initiales dans un cercle teinté (40 à 44 px). */
export function IconCircle({ icon: Icon, initials, bg = "surfaceSoft", fg = "ink", diameter = size.rowIcon }: Props) {
  return (
    <View
      style={{
        width: diameter,
        height: diameter,
        borderRadius: diameter,
        backgroundColor: color[bg],
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {Icon ? (
        <Icon size={diameter * 0.45} strokeWidth={1.8} color={color[fg]} />
      ) : (
        <Text variant="status" tone={fg} style={{ fontSize: 14, fontFamily: "PlusJakartaSans_800ExtraBold" }}>
          {initials}
        </Text>
      )}
    </View>
  );
}
