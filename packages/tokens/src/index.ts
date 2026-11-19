import { baseColor, baseRadius, baseSpacing, baseType } from "./generated";

/**
 * Tokens Keyo.
 * Base : docs/design/tokens.json (généré). Les ajustements de la refonte du 18 novembre 2026
 * (docs/design/charte.md, « Style des maquettes ») sont appliqués ici et priment.
 */
export const color = {
  ...baseColor,
  // Refonte : fond des écrans et texte secondaire utilisés par les maquettes.
  surface: "#F3F6F9",
  inkMuted: "#5A6A80",
  // Fond des boutons secondaires clairs et des cercles d'icône neutres.
  surfaceSoft: "#E9EFF5",
  // Points de statut (7 px) : plus vifs que les couleurs de texte.
  dotPaid: baseColor.mint,
  dotLate: "#F79009",
  dotDanger: "#F04438",
  // Segment « à venir » des barres de progression.
  track: "#C3CCD8",
  scrim: "rgba(11, 27, 51, 0.72)",
} as const;

export const type = {
  ...baseType,
  // Titre d'écran des maquettes (30/36, 800, resserré).
  screenTitle: { fontSize: 30, lineHeight: 36, fontWeight: 800 },
  section: { fontSize: 18, lineHeight: 24, fontWeight: 800 },
  rowTitle: { fontSize: 16, lineHeight: 22, fontWeight: 700 },
  rowSubtitle: { fontSize: 14, lineHeight: 20, fontWeight: 500 },
  status: { fontSize: 13, lineHeight: 18, fontWeight: 700 },
} as const;

export const letterSpacing = {
  /** -0,025 em pour les titres en 800. */
  tight: (fontSize: number) => -0.025 * fontSize,
} as const;

export const spacing = {
  ...baseSpacing,
  screen: 24,
} as const;

export const radius = {
  ...baseRadius,
  card: 28,
  sheet: 32,
} as const;

export const size = {
  button: 56,
  row: 72,
  rowIcon: 44,
  statusDot: 7,
  tabBar: 64,
} as const;

export const fontFamily = {
  regular: "PlusJakartaSans_400Regular",
  medium: "PlusJakartaSans_500Medium",
  semibold: "PlusJakartaSans_600SemiBold",
  bold: "PlusJakartaSans_700Bold",
  extrabold: "PlusJakartaSans_800ExtraBold",
} as const;

export type ColorToken = keyof typeof color;
export type TypeToken = keyof typeof type;
