import { Pressable } from "react-native";
import type { LucideIcon } from "lucide-react-native";
import { color } from "@keyo/tokens";

/** Bouton rond blanc (retour, recherche, notifications), posé sur la carte ou une photo. */
export function RoundButton({ icon: Icon, onPress, label, diameter = 44 }: { icon: LucideIcon; onPress?: () => void; label: string; diameter?: number }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      style={({ pressed }) => ({
        width: diameter,
        height: diameter,
        borderRadius: diameter,
        backgroundColor: color.surfaceRaised,
        alignItems: "center",
        justifyContent: "center",
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Icon size={22} strokeWidth={1.8} color={color.ink} />
    </Pressable>
  );
}
