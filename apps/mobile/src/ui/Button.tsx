import { Pressable, View, type PressableProps } from "react-native";
import type { LucideIcon } from "lucide-react-native";
import { color, size, type ColorToken } from "@keyo/tokens";
import { Text } from "./Text";

type Kind = "primary" | "secondary" | "soft";
const BG: Record<Kind, ColorToken> = { primary: "mint", secondary: "night", soft: "surfaceSoft" };
// Texte sur mint = night, jamais blanc.
const FG: Record<Kind, ColorToken> = { primary: "onMint", secondary: "onNight", soft: "ink" };

type Props = Omit<PressableProps, "children"> & { label: string; kind?: Kind; icon?: LucideIcon };

/** Bouton en pilule, 56 px. Un seul « primary » par écran. */
export function Button({ label, kind = "primary", icon: Icon, disabled, style, ...rest }: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      {...rest}
      style={(state) => [
        {
          height: size.button,
          borderRadius: 999,
          backgroundColor: color[BG[kind]],
          alignItems: "center",
          justifyContent: "center",
          opacity: disabled ? 0.4 : state.pressed ? 0.85 : 1,
        },
        typeof style === "function" ? style(state) : style,
      ]}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        {Icon && <Icon size={22} strokeWidth={1.8} color={color[FG[kind]]} />}
        <Text variant="bodyStrong" tone={FG[kind]} style={{ fontSize: 17, fontFamily: "PlusJakartaSans_800ExtraBold" }}>
          {label}
        </Text>
      </View>
    </Pressable>
  );
}
