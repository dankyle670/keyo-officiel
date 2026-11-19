import Svg, { Circle, Path, Rect } from "react-native-svg";
import { color } from "@keyo/tokens";

/** Symbole Keyo : serrure mint dans un carré night arrondi (docs/design/logos/keyo-mark.svg). */
export function KeyoMark({ size = 64, background = color.night }: { size?: number; background?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" accessibilityLabel="Keyo">
      <Rect width={64} height={64} rx={16} fill={background} />
      <Circle cx={32} cy={27} r={10} fill={color.mint} />
      <Path d="M27.5 31h9l3.5 18a2 2 0 0 1-2 2.4H26a2 2 0 0 1-2-2.4z" fill={color.mint} />
      <Circle cx={32} cy={27} r={3.6} fill={color.night} />
    </Svg>
  );
}

/** Symbole DK seul, monochrome (blanc sur night, encre #111121 sur fond clair). Jamais recoloré. */
export function DkSymbol({ width = 40, ink = "#FFFFFF" }: { width?: number; ink?: "#FFFFFF" | "#111121" }) {
  return (
    <Svg width={width} height={(width * 178) / 270} viewBox="0 0 270 178" accessibilityLabel="DK Group">
      <Path
        d="M122.85 140.038C116.573 142.058,109.35 143,101.115 143L38.813 143L38.813 34.413L101.115 34.413C109.215 34.413,116.37 35.355,122.648 37.173C126.698 38.384,130.208 40.269,133.38 42.491L161.055 17.38C154.643 12.466,147.758 8.225,139.725 5.465C129.263 1.829,117.923 0.012,105.705 0.012L0 0.012L0 177.199L105.705 177.199C117.518 177.199,128.723 175.584,139.118 172.285C149.445 169.054,158.423 163.87,166.118 156.936L136.823 131.758C132.908 135.393,128.385 138.221,122.85 139.971L122.85 140.038Z"
        fill={ink}
      />
      <Path d="M158.422 82.939L251.842 0L201.352 0L108.674 84.016L105.771 86.776L108.944 89.536L210.869 177.188L269.999 177.188L158.422 82.939Z" fill={ink} />
    </Svg>
  );
}

/** Motif de marque : silhouette de serrure en grand, en night-soft, derrière le texte des écrans forts. */
export function LockMotif({ size = 220, fill = color.nightSoft }: { size?: number; fill?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" pointerEvents="none">
      <Circle cx={32} cy={27} r={10} fill={fill} />
      <Path d="M27.5 31h9l3.5 18a2 2 0 0 1-2 2.4H26a2 2 0 0 1-2-2.4z" fill={fill} />
    </Svg>
  );
}
