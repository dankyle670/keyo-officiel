import { Pressable } from "react-native";
import { color, fontFamily } from "@keyo/tokens";
import { Text } from "./Text";

/** Puce de filtre en pilule : active en night, inactive en blanc. */
export function Chip({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      style={{ height: 40, paddingHorizontal: 16, borderRadius: 999, justifyContent: "center", backgroundColor: active ? color.night : color.surfaceRaised }}
    >
      <Text variant="rowSubtitle" tone={active ? "onNight" : "ink"} style={{ fontFamily: fontFamily.bold }}>
        {label}
      </Text>
    </Pressable>
  );
}
