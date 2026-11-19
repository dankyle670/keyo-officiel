import { Text as RNText, type TextProps, type TextStyle } from "react-native";
import { color, fontFamily, letterSpacing, type as typeScale, type ColorToken, type TypeToken } from "@keyo/tokens";

const FAMILY_BY_WEIGHT: Record<number, string> = {
  400: fontFamily.regular,
  500: fontFamily.medium,
  600: fontFamily.semibold,
  700: fontFamily.bold,
  800: fontFamily.extrabold,
};

export type KTextProps = TextProps & {
  variant?: TypeToken;
  tone?: ColorToken;
  /** Chiffres tabulaires, pour les montants. */
  tabular?: boolean;
  align?: TextStyle["textAlign"];
};

/** Texte Keyo : Plus Jakarta Sans, échelle et couleurs issues des tokens uniquement. */
export function Text({ variant = "body", tone = "ink", tabular, align, style, ...rest }: KTextProps) {
  const t = typeScale[variant];
  const tight = t.fontWeight === 800;
  return (
    <RNText
      {...rest}
      style={[
        {
          fontFamily: FAMILY_BY_WEIGHT[t.fontWeight],
          fontSize: t.fontSize,
          lineHeight: t.lineHeight,
          color: color[tone],
          letterSpacing: tight ? letterSpacing.tight(t.fontSize) : undefined,
          fontVariant: tabular ? ["tabular-nums"] : undefined,
          textAlign: align,
        },
        style,
      ]}
    />
  );
}
