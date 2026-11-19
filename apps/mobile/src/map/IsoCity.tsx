import { useMemo, useState } from "react";
import { Pressable, View, type LayoutChangeEvent } from "react-native";
import Svg, { G, Path, Polygon, Rect } from "react-native-svg";
import { color } from "@keyo/tokens";
import type { AssetMarker } from "./types";

/**
 * Illustration isométrique de secours (Expo Go, absence de jeton Mapbox, hors ligne).
 * Reprend le rendu des maquettes : ville claire, fleuve, biens en cubes night au toit mint.
 */
const GROUND = "#E4E9F0";
const BLOCK_TOP = "#FFFFFF";
const BLOCK_LEFT = "#D3DCE7";
const BLOCK_RIGHT = "#BCC8D6";
const WATER = "#BFD8F2";

function Cube({ x, y, s, h, top, left, right }: { x: number; y: number; s: number; h: number; top: string; left: string; right: string }) {
  // (x, y) = sommet avant du toit.
  const t = [`${x},${y - s / 2}`, `${x + s},${y}`, `${x},${y + s / 2}`, `${x - s},${y}`].join(" ");
  const l = [`${x - s},${y}`, `${x},${y + s / 2}`, `${x},${y + s / 2 + h}`, `${x - s},${y + h}`].join(" ");
  const r = [`${x},${y + s / 2}`, `${x + s},${y}`, `${x + s},${y + h}`, `${x},${y + s / 2 + h}`].join(" ");
  return (
    <G>
      <Polygon points={l} fill={left} />
      <Polygon points={r} fill={right} />
      <Polygon points={t} fill={top} />
    </G>
  );
}

// Générateur pseudo-aléatoire déterministe : la ville ne « saute » pas entre deux rendus.
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

export function IsoCity({ markers, onPressAsset, compact }: { markers: AssetMarker[]; onPressAsset?: (id: string) => void; compact?: boolean }) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  const onLayout = (e: LayoutChangeEvent) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height });
  const { w, h } = size;

  const blocks = useMemo(() => {
    const r = rng(7);
    const out: { x: number; y: number; s: number; h: number }[] = [];
    for (let row = -1; row < 16; row++)
      for (let col = -1; col < 7; col++) {
        if (r() < 0.35) continue;
        out.push({ x: col * 72 + (row % 2) * 36 + r() * 10, y: row * 58 + r() * 8, s: 22 + r() * 16, h: 10 + r() * 34 });
      }
    return out;
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: GROUND }} onLayout={onLayout}>
      {w > 0 && (
        <Svg width={w} height={h} style={{ position: "absolute" }}>
          <Rect width={w} height={h} fill={GROUND} />
          {/* Routes en diagonale */}
          {Array.from({ length: 14 }, (_, i) => (
            <G key={i}>
              <Path d={`M${i * 70 - 300} 0 L${i * 70 - 300 + h * 0.9} ${h}`} stroke="#FFFFFF" strokeWidth={7} />
              <Path d={`M${i * 70} 0 L${i * 70 - h * 0.9} ${h}`} stroke="#FFFFFF" strokeWidth={7} />
            </G>
          ))}
          {/* Fleuve (lagune Ébrié) */}
          <Path
            d={`M0 ${h * 0.26} C ${w * 0.35} ${h * 0.3}, ${w * 0.6} ${h * 0.27}, ${w * 0.8} ${h * 0.36} S ${w} ${h * 0.6}, ${w * 1.05} ${h * 0.66} L ${w * 1.05} ${h * 0.5} C ${w * 0.95} ${h * 0.36}, ${w * 0.7} ${h * 0.22}, ${w * 0.4} ${h * 0.22} S 0 ${h * 0.2}, 0 ${h * 0.2} Z`}
            fill={WATER}
            opacity={compact ? 0 : 1}
          />
          {blocks.map((b, i) => (
            <Cube key={i} x={b.x} y={b.y} s={b.s} h={b.h} top={BLOCK_TOP} left={BLOCK_LEFT} right={BLOCK_RIGHT} />
          ))}
          {markers.map((m) => (
            <Cube key={m.id} x={m.x * w} y={m.y * h} s={compact ? 62 : 50} h={compact ? 62 : 54} top={color.mint} left="#1E3A62" right={color.night} />
          ))}
        </Svg>
      )}
      {w > 0 &&
        markers.map((m) => (
          <Pressable
            key={m.id}
            onPress={onPressAsset ? () => onPressAsset(m.id) : undefined}
            accessibilityRole={onPressAsset ? "button" : undefined}
            accessibilityLabel={`${m.name}${m.label ? `, ${m.label}` : ""}`}
            style={{ position: "absolute", left: m.x * w - 80, top: m.y * h - (m.label ? 54 : 44), width: 160, alignItems: "center" }}
          >
            {m.pin}
          </Pressable>
        ))}
    </View>
  );
}
