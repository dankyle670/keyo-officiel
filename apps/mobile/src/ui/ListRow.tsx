import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import { ChevronRight } from "lucide-react-native";
import { color, size } from "@keyo/tokens";
import { Text } from "./Text";

type Props = {
  leading?: ReactNode;
  title: string;
  subtitle?: string;
  trailing?: ReactNode;
  chevron?: boolean;
  divider?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
};

/** Ligne de liste d'environ 72 px, séparée par un filet `line`, sans carte autour. */
export function ListRow({ leading, title, subtitle, trailing, chevron, divider = true, onPress, onLongPress }: Props) {
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={!onPress && !onLongPress}
      accessibilityRole={onPress ? "button" : undefined}
      style={({ pressed }) => ({
        minHeight: size.row,
        flexDirection: "row",
        alignItems: "center",
        gap: 14,
        paddingVertical: 14,
        borderTopWidth: divider ? 1 : 0,
        borderTopColor: color.line,
        opacity: pressed ? 0.6 : 1,
      })}
    >
      {leading}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="rowTitle" numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="rowSubtitle" tone="inkMuted" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing ? <View style={{ alignItems: "flex-end", gap: 2 }}>{trailing}</View> : null}
      {chevron ? <ChevronRight size={20} strokeWidth={1.8} color={color.inkMuted} /> : null}
    </Pressable>
  );
}
