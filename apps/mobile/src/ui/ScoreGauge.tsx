import { View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { color } from "@keyo/tokens";
import { Text } from "./Text";

/** Jauge en arc (270°) pour un score sur `max`, sur fond `night`. */
export function ScoreGauge({ score, max = 1000, label, size = 220 }: { score: number; max?: number; label: string; size?: number }) {
  const stroke = 16;
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const start = 135;
  const sweep = 270;
  const point = (deg: number) => {
    const a = (deg * Math.PI) / 180;
    return `${cx + r * Math.cos(a)} ${cy + r * Math.sin(a)}`;
  };
  const arc = (from: number, to: number) => `M ${point(from)} A ${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${point(to)}`;
  const ratio = Math.max(0, Math.min(1, score / max));
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }} accessibilityLabel={`Score ${score} sur ${max}, ${label}`}>
      <Svg width={size} height={size} style={{ position: "absolute" }}>
        <Path d={arc(start, start + sweep)} stroke={color.nightSoft} strokeWidth={stroke} strokeLinecap="round" fill="none" />
        {ratio > 0 && <Path d={arc(start, start + Math.max(1, sweep * ratio))} stroke={color.mint} strokeWidth={stroke} strokeLinecap="round" fill="none" />}
      </Svg>
      <Text variant="display" tone="onNight" tabular style={{ fontSize: 56, lineHeight: 62 }}>
        {String(score)}
      </Text>
      <Text variant="rowTitle" tone="mint">
        {label}
      </Text>
    </View>
  );
}
