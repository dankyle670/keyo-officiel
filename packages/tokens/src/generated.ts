// Fichier généré par scripts/generate.mjs depuis docs/design/tokens.json. Ne pas modifier à la main.
export const baseColor = {
  "night": "#0B1B33",
  "nightSoft": "#1B2D4F",
  "mint": "#2ED47A",
  "mintDeep": "#0B7A4B",
  "mintTint": "#DDF7EA",
  "onMint": "#0B1B33",
  "surface": "#F5F7FA",
  "surfaceRaised": "#FFFFFF",
  "ink": "#0B1B33",
  "inkMuted": "#55657D",
  "onNight": "#FFFFFF",
  "line": "#E2E7EE",
  "sky": "#2F5BEA",
  "amber": "#B54708",
  "amberTint": "#FEF0C7",
  "danger": "#C4320A",
  "dangerTint": "#FEE4E2"
} as const;

export const baseType = {
  "display": {
    "fontSize": 36,
    "lineHeight": 40,
    "fontWeight": 800
  },
  "title": {
    "fontSize": 26,
    "lineHeight": 32,
    "fontWeight": 700
  },
  "heading": {
    "fontSize": 18,
    "lineHeight": 24,
    "fontWeight": 700
  },
  "amount": {
    "fontSize": 32,
    "lineHeight": 36,
    "fontWeight": 800
  },
  "body": {
    "fontSize": 16,
    "lineHeight": 24,
    "fontWeight": 400
  },
  "bodyStrong": {
    "fontSize": 16,
    "lineHeight": 24,
    "fontWeight": 600
  },
  "caption": {
    "fontSize": 13,
    "lineHeight": 18,
    "fontWeight": 500
  }
} as const;

export const baseSpacing = {
  "s1": 4,
  "s2": 8,
  "s4": 16,
  "s6": 24,
  "s8": 32
} as const;

export const baseRadius = {
  "sm": 10,
  "md": 16,
  "lg": 28,
  "pill": 999
} as const;
