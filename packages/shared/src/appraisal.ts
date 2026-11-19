import type { Agreement, Asset, AssetUnit, Document } from "./domain.ts";
import type { Currency, Money } from "./money.ts";
import { roundValue, valueAsset } from "./valuation.ts";

/**
 * Expertise Keyo : l'entretien qu'un expert immobilier ou agricole mènerait, puis une estimation
 * par comparaison (prix au m² ou à l'hectare, ajustés par l'état, la situation juridique, l'accès…).
 * Déterministe et testé : l'agent pose les questions et s'appuie sur ce calcul, sans inventer de prix.
 * Ouvert pour l'instant aux maisons, appartements et plantations.
 * Les barèmes sont des repères de marché indicatifs, à remplacer par des prix réels par quartier.
 */
export type AppraisalKind = "HOUSE" | "APARTMENT" | "PLANTATION";

export function appraisalKind(a: Asset): AppraisalKind | null {
  if (a.type === "PLANTATION") return "PLANTATION";
  if (a.type === "REAL_ESTATE" && (a.details.kind === "HOUSE" || a.details.kind === "APARTMENT")) return a.details.kind;
  return null;
}

export type QuestionOption = { value: string; label: string; hint?: string };
export type AppraisalQuestion = {
  id: string;
  /** Question posée par l'expert, en une phrase. */
  ask: string;
  hint?: string;
  type: "choice" | "multi" | "number";
  options?: QuestionOption[];
  unit?: string;
  optional?: boolean;
  /** Réponse déjà connue par Keyo, à confirmer. */
  prefill?: string | string[] | number;
};
export type AppraisalAnswers = Record<string, string | string[] | number | null | undefined>;

const opt = (value: string, label: string, hint?: string): QuestionOption => ({ value, label, hint });

const TIERS_CI = [
  opt("PRIME", "Haut standing", "Cocody Riviera, Deux-Plateaux, Zone 4, Plateau"),
  opt("RESIDENTIAL", "Résidentiel", "Angré, Marcory, Bingerville, Palmeraie"),
  opt("POPULAR", "Populaire", "Yopougon, Abobo, Koumassi, Port-Bouët"),
  opt("OUTSKIRTS", "Périphérie ou intérieur du pays", "Anyama, Songon, villes de l'intérieur"),
];
const TIERS_FR = [
  opt("PRIME", "Centre d'une grande ville", "Paris, Lyon, Bordeaux"),
  opt("RESIDENTIAL", "Ville moyenne ou quartier recherché"),
  opt("POPULAR", "Périurbain"),
  opt("OUTSKIRTS", "Rural"),
];

export function appraisalQuestions(a: Asset, units: AssetUnit[]): AppraisalQuestion[] {
  const kind = appraisalKind(a);
  if (!kind) return [];
  const own = units.filter((u) => u.assetId === a.id);
  const ci = a.location.country === "CI";
  if (kind === "PLANTATION") {
    const ha = own.reduce((n, u) => n + (typeof u.details.areaHa === "number" ? u.details.areaHa : 0), 0);
    return [
      {
        id: "crop",
        ask: "Quelle culture est plantée ?",
        type: "choice",
        options: [opt("COCOA", "Cacao"), opt("RUBBER", "Hévéa"), opt("CASHEW", "Anacarde"), opt("PALM", "Palmier à huile"), opt("OTHER", "Autre culture")],
        prefill: typeof a.details.kind === "string" ? a.details.kind : undefined,
      },
      { id: "plantedHa", ask: "Combien d'hectares sont plantés ?", type: "number", unit: "ha", prefill: ha || undefined },
      { id: "totalHa", ask: "Et la surface totale du terrain, réserves comprises ?", hint: "Laissez vide si elle est égale à la surface plantée.", type: "number", unit: "ha", optional: true },
      ...(ci
        ? [
            {
              id: "region",
              ask: "Dans quelle région se trouve la plantation ?",
              type: "choice" as const,
              options: [opt("SW", "Sud-Ouest", "San-Pédro, Soubré, Méagui"), opt("CW", "Centre-Ouest", "Daloa, Issia, Gagnoa"), opt("S", "Sud", "Agboville, Divo, Aboisso"), opt("E", "Est", "Abengourou, Bondoukou"), opt("N", "Nord et Centre", "Korhogo, Bouaké")],
            },
          ]
        : []),
      {
        id: "stage",
        ask: "À quel stade en sont les plants ?",
        type: "choice",
        options: [opt("YOUNG", "Jeunes, pas encore en production"), opt("STARTING", "Entrée en production"), opt("FULL", "Pleine production"), opt("OLD", "Vieillissants, à renouveler")],
      },
      { id: "yieldKgHa", ask: "Quel rendement avez-vous obtenu à la dernière campagne ?", hint: "En kilos par hectare. Passez si vous ne savez pas.", type: "number", unit: "kg/ha", optional: true },
      { id: "upkeep", ask: "Comment est-elle entretenue ?", type: "choice", options: [opt("GOOD", "Très bien entretenue"), opt("FAIR", "Correctement"), opt("POOR", "Négligée ou envahie")] },
      {
        id: "legal",
        ask: "Quel document prouve la propriété du terrain ?",
        type: "choice",
        options: [opt("TF", "Titre foncier"), opt("CF", "Certificat foncier"), opt("CUSTOM", "Attestation villageoise ou droit coutumier"), opt("NONE", "Aucun document")],
      },
      { id: "access", ask: "Comment y accède-t-on ?", type: "choice", options: [opt("PAVED", "Route bitumée"), opt("TRACK", "Piste praticable toute l'année"), opt("HARD", "Piste coupée en saison des pluies")] },
      {
        id: "equipment",
        ask: "Qu'y a-t-il sur place ?",
        hint: "Plusieurs réponses possibles.",
        type: "multi",
        optional: true,
        options: [opt("HOUSING", "Logement du gérant"), opt("DRYER", "Séchoir ou magasin"), opt("WATER", "Point d'eau ou forage"), opt("FENCE", "Clôture ou bornage"), opt("TOOLS", "Matériel agricole")],
      },
      { id: "ownerGuess", ask: "Selon vous, combien vaut-elle ?", hint: "Facultatif. Cela permet de comparer avec l'estimation.", type: "number", unit: a.currency === "XOF" ? "FCFA" : a.currency, optional: true },
    ];
  }
  const house = kind === "HOUSE";
  const rooms = own.reduce((n, u) => n + (typeof u.details.rooms === "number" ? u.details.rooms : 0), 0);
  return [
    { id: "tier", ask: "Dans quel type de quartier se trouve le bien ?", type: "choice", options: ci ? TIERS_CI : TIERS_FR },
    { id: "surface", ask: "Quelle est la surface habitable ?", type: "number", unit: "m²" },
    ...(house ? [{ id: "land", ask: "Et la surface du terrain ?", hint: "Passez si vous ne la connaissez pas.", type: "number" as const, unit: "m²", optional: true }] : []),
    { id: "rooms", ask: "Combien de pièces principales ?", hint: "Chambres et séjour, sans cuisine ni salle d'eau.", type: "number", prefill: rooms || undefined },
    {
      id: "age",
      ask: "Quand a-t-il été construit ?",
      type: "choice",
      options: [opt("LT5", "Il y a moins de 5 ans"), opt("5_15", "Entre 5 et 15 ans"), opt("15_30", "Entre 15 et 30 ans"), opt("GT30", "Il y a plus de 30 ans")],
    },
    { id: "condition", ask: "Dans quel état est-il ?", type: "choice", options: [opt("NEW", "Neuf ou rénové"), opt("GOOD", "Bon état"), opt("WORKS", "Travaux à prévoir"), opt("HEAVY", "Gros travaux")] },
    { id: "finish", ask: "Et les finitions ?", hint: "Carrelage, menuiseries, cuisine, sanitaires.", type: "choice", options: [opt("HIGH", "Haut de gamme"), opt("STANDARD", "Standard"), opt("BASIC", "Basiques")] },
    ...(!house
      ? [
          {
            id: "floor",
            ask: "À quel étage se trouve l'appartement ?",
            type: "choice" as const,
            options: [opt("GROUND", "Rez-de-chaussée"), opt("LOW", "1er au 3e étage"), opt("HIGH_LIFT", "4e ou plus, avec ascenseur"), opt("HIGH_NOLIFT", "4e ou plus, sans ascenseur")],
          },
        ]
      : []),
    {
      id: "equipment",
      ask: "Quels équipements le bien possède-t-il ?",
      hint: "Plusieurs réponses possibles.",
      type: "multi",
      optional: true,
      options: [
        ...(house ? [opt("POOL", "Piscine")] : []),
        opt("GENERATOR", "Groupe électrogène"),
        opt("WATER", "Forage ou réserve d'eau"),
        opt("AC", "Climatisation"),
        opt("PARKING", "Parking ou garage"),
        opt("GUARD", "Gardiennage"),
        ...(!house ? [opt("LIFT", "Ascenseur")] : []),
        opt("TERRACE", "Balcon ou terrasse"),
      ],
    },
    ...(ci
      ? [
          {
            id: "legal",
            ask: "Quel document prouve la propriété ?",
            type: "choice" as const,
            options: [opt("TF", "Titre foncier"), opt("ACD", "ACD (arrêté de concession définitive)"), opt("CUSTOM", "Lettre d'attribution ou attestation villageoise"), opt("NONE", "Aucun document")],
          },
        ]
      : []),
    { id: "access", ask: "Comment est la voie d'accès ?", type: "choice", options: [opt("PAVED", "Route bitumée"), opt("DIRT", "Voie en terre praticable"), opt("HARD", "Accès difficile")] },
    {
      id: "surroundings",
      ask: "Quelque chose de particulier dans l'environnement ?",
      hint: "Plusieurs réponses possibles.",
      type: "multi",
      optional: true,
      options: [opt("VIEW", "Vue dégagée ou lagune"), opt("SERVICES", "Proche écoles et commerces"), opt("FLOOD", "Zone inondable"), opt("NOISE", "Bruit ou nuisances")],
    },
    { id: "ownerGuess", ask: "Selon vous, combien vaut-il ?", hint: "Facultatif. Cela permet de comparer avec l'estimation.", type: "number", unit: a.currency === "XOF" ? "FCFA" : a.currency, optional: true },
  ];
}

/** Barèmes en unité mineure. Hors Côte d'Ivoire, repères européens convertis dans la devise du bien. */
const HOME_M2: Record<"CI" | "EU", Record<string, number>> = {
  CI: { PRIME: 900_000, RESIDENTIAL: 500_000, POPULAR: 250_000, OUTSKIRTS: 120_000 },
  EU: { PRIME: 600_000, RESIDENTIAL: 250_000, POPULAR: 200_000, OUTSKIRTS: 130_000 },
};
const LAND_M2: Record<"CI" | "EU", Record<string, number>> = {
  CI: { PRIME: 250_000, RESIDENTIAL: 120_000, POPULAR: 60_000, OUTSKIRTS: 15_000 },
  EU: { PRIME: 30_000, RESIDENTIAL: 12_000, POPULAR: 8_000, OUTSKIRTS: 3_000 },
};
/** Plantation : valeur à l'hectare planté selon la culture et le stade (FCFA). */
const PLANT_HA: Record<string, Record<string, number>> = {
  COCOA: { YOUNG: 900_000, STARTING: 1_800_000, FULL: 2_500_000, OLD: 1_000_000 },
  RUBBER: { YOUNG: 1_500_000, STARTING: 2_800_000, FULL: 3_500_000, OLD: 1_500_000 },
  CASHEW: { YOUNG: 600_000, STARTING: 1_100_000, FULL: 1_500_000, OLD: 800_000 },
  PALM: { YOUNG: 800_000, STARTING: 1_500_000, FULL: 2_000_000, OLD: 900_000 },
  OTHER: { YOUNG: 500_000, STARTING: 900_000, FULL: 1_200_000, OLD: 600_000 },
};
const REF_YIELD: Record<string, number> = { COCOA: 500, RUBBER: 1500, CASHEW: 500, PALM: 10_000 };
const BARE_LAND_HA = 500_000;
const XOF_PER_EUR = 655.957;

/** Montant en FCFA exprimé dans la devise du bien (unité mineure). */
const fromXof = (xof: number, c: Currency) => (c === "XOF" ? xof : Math.round((xof / XOF_PER_EUR) * 100));

const pick = (table: Record<string, number>, key: unknown, fallback = 1) => (typeof key === "string" && key in table ? table[key]! : fallback);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0);
const list = (v: unknown) => (Array.isArray(v) ? v : []);
const pct = (f: number) => `${f >= 1 ? "+" : "−"}${Math.round(Math.abs(f - 1) * 100)} %`;

export type AppraisalFactor = { label: string; effect: string };
export type AppraisalResult = {
  kind: AppraisalKind;
  value: Money;
  low: Money;
  high: Money;
  confidence: "LOW" | "MEDIUM" | "HIGH";
  method: string;
  factors: AppraisalFactor[];
  perUnit: { unitId: string; value: Money }[];
  /** Écart entre l'avis du propriétaire et l'estimation, en %. */
  ownerGapPercent?: number;
  /** Questions obligatoires restées sans réponse. */
  missing: string[];
};

export type AppraisalInput = { asset: Asset; units: AssetUnit[]; agreements: Agreement[]; documents: Document[]; today: string; answers: AppraisalAnswers };

export function appraise(input: AppraisalInput): AppraisalResult | null {
  const { asset: a, answers: ans } = input;
  const kind = appraisalKind(a);
  if (!kind) return null;
  const c = a.currency;
  const questions = appraisalQuestions(a, input.units);
  const get = (id: string) => ans[id] ?? questions.find((q) => q.id === id)?.prefill;
  const missing = questions.filter((q) => !q.optional && (get(q.id) === undefined || get(q.id) === null || get(q.id) === "")).map((q) => q.id);
  const label = (id: string) => {
    const q = questions.find((x) => x.id === id);
    const v = get(id);
    return q?.options?.find((o) => o.value === v)?.label ?? String(v ?? "");
  };
  const factors: AppraisalFactor[] = [];
  const apply = (name: string, f: number) => {
    if (f !== 1) factors.push({ label: name, effect: pct(f) });
    return f;
  };
  const own = input.units.filter((u) => u.assetId === a.id);
  let value: number;
  let method: string;

  if (kind === "PLANTATION") {
    const crop = String(get("crop") ?? "OTHER");
    const stage = String(get("stage") ?? "FULL");
    const planted = num(get("plantedHa"));
    const total = Math.max(planted, num(get("totalHa")));
    const perHa = fromXof(pick(PLANT_HA[crop] ?? PLANT_HA.OTHER!, stage, PLANT_HA.OTHER!.FULL!), c);
    factors.push({ label: `${label("crop")}, ${label("stage").toLowerCase()}`, effect: `${planted.toLocaleString("fr-FR")} ha plantés` });
    let plantation = planted * perHa;
    const y = num(get("yieldKgHa"));
    if (y && REF_YIELD[crop] && (stage === "FULL" || stage === "STARTING")) plantation *= apply(`Rendement de ${y} kg/ha`, Math.min(1.3, Math.max(0.7, y / REF_YIELD[crop]!)));
    plantation *= apply(`Entretien : ${label("upkeep").toLowerCase()}`, pick({ GOOD: 1.05, FAIR: 1, POOR: 0.75 }, get("upkeep")));
    plantation *= apply(`Région : ${label("region")}`, pick({ SW: 1.05, CW: 1, S: 1, E: 0.95, N: crop === "CASHEW" ? 1.05 : 0.9 }, get("region")));
    let land = total * fromXof(BARE_LAND_HA, c);
    const legal = apply(`Propriété : ${label("legal").toLowerCase()}`, pick({ TF: 1, CF: 0.95, CUSTOM: 0.75, NONE: 0.55 }, get("legal")));
    const access = apply(`Accès : ${label("access").toLowerCase()}`, pick({ PAVED: 1.05, TRACK: 1, HARD: 0.82 }, get("access")));
    land *= legal * access;
    plantation *= legal * access;
    const eq = list(get("equipment"));
    const fixed = (eq.includes("HOUSING") ? 1_500_000 : 0) + (eq.includes("DRYER") ? 800_000 : 0) + (eq.includes("WATER") ? 400_000 : 0) + (eq.includes("TOOLS") ? 500_000 : 0);
    if (fixed) factors.push({ label: "Bâtiments et équipements", effect: `+${(fromXof(fixed, c) / (c === "XOF" ? 1 : 100)).toLocaleString("fr-FR")} ${c === "XOF" ? "FCFA" : c}` });
    value = plantation + land + fromXof(fixed, c);
    if (eq.includes("FENCE")) value *= apply("Clôture ou bornage", 1.02);
    method = "Valeur à l'hectare planté selon la culture et le stade, plus la valeur du terrain nu, ajustées par l'entretien, la situation juridique et l'accès.";
  } else {
    const zone = a.location.country === "CI" ? "CI" : "EU";
    const conv = (x: number) => (zone === "CI" ? fromXof(x, c) : c === "XOF" ? Math.round((x / 100) * XOF_PER_EUR) : x);
    const surface = num(get("surface"));
    const tier = get("tier");
    const m2 = conv(pick(HOME_M2[zone], tier, HOME_M2[zone].RESIDENTIAL!));
    factors.push({ label: `${label("tier")}`, effect: `${surface.toLocaleString("fr-FR")} m² habitables` });
    let building = surface * m2;
    building *= apply(`Construit ${label("age").toLowerCase()}`, pick({ LT5: 1, "5_15": 0.92, "15_30": 0.8, GT30: 0.68 }, get("age")));
    building *= apply(`État : ${label("condition").toLowerCase()}`, pick({ NEW: 1.08, GOOD: 1, WORKS: 0.85, HEAVY: 0.65 }, get("condition")));
    building *= apply(`Finitions : ${label("finish").toLowerCase()}`, pick({ HIGH: 1.15, STANDARD: 1, BASIC: 0.85 }, get("finish")));
    const landM2 = num(get("land"));
    const land = kind === "HOUSE" ? Math.max(0, landM2 - surface / 2) * conv(pick(LAND_M2[zone], tier, LAND_M2[zone].RESIDENTIAL!)) : 0;
    if (land) factors.push({ label: `Terrain de ${landM2.toLocaleString("fr-FR")} m²`, effect: "valeur du foncier ajoutée" });
    value = building + land;
    const EQ: Record<string, number> = { POOL: 0.04, GENERATOR: 0.02, WATER: 0.02, AC: 0.01, PARKING: 0.02, GUARD: 0.01, LIFT: 0.02, TERRACE: 0.01 };
    const eqPct = list(get("equipment")).reduce((n, e) => n + (EQ[String(e)] ?? 0), 0);
    if (eqPct) value *= apply("Équipements", 1 + eqPct);
    if (kind === "APARTMENT") value *= apply(`Étage : ${label("floor").toLowerCase()}`, pick({ GROUND: 0.97, LOW: 1, HIGH_LIFT: 1.02, HIGH_NOLIFT: 0.88 }, get("floor")));
    if (zone === "CI") value *= apply(`Propriété : ${label("legal")}`, pick({ TF: 1, ACD: 0.97, CUSTOM: 0.75, NONE: 0.6 }, get("legal")));
    value *= apply(`Accès : ${label("access").toLowerCase()}`, pick({ PAVED: 1, DIRT: 0.92, HARD: 0.8 }, get("access")));
    const env = list(get("surroundings"));
    if (env.includes("VIEW")) value *= apply("Vue dégagée", 1.05);
    if (env.includes("SERVICES")) value *= apply("Proche des commodités", 1.03);
    if (env.includes("FLOOD")) value *= apply("Zone inondable", 0.85);
    if (env.includes("NOISE")) value *= apply("Nuisances", 0.93);
    method = "Comparaison avec les prix au m² du quartier, ajustés par l'âge, l'état, les finitions, les équipements, la situation juridique et l'accès.";
  }

  // Le revenu locatif, s'il existe, sert de contrôle (20 %).
  const income = valueAsset(input).incomeValue;
  if (income && value > 0) {
    value = value * 0.8 + income.amount * 0.2;
    factors.push({ label: "Contrôle par le revenu locatif", effect: "pris en compte à 20 %" });
    method += " Le revenu locatif actuel sert de contrôle.";
  }

  const result = roundValue({ amount: Math.max(0, Math.round(value)), currency: c });
  const docs = input.documents.filter((d) => d.assetId === a.id);
  const solidTitle = get("legal") === "TF" || docs.some((d) => d.kind === "TITLE_DEED");
  const confidence: AppraisalResult["confidence"] = missing.length ? "LOW" : solidTitle && docs.some((d) => d.kind === "PHOTO" || d.kind === "APPRAISAL") ? "HIGH" : "MEDIUM";
  const spread = { LOW: 0.2, MEDIUM: 0.12, HIGH: 0.08 }[confidence];

  // Répartition par unité : à la surface (parcelles) ou à parts égales.
  const weights = own.map((u) => num(kind === "PLANTATION" ? u.details.areaHa : 1) || 1);
  const wsum = weights.reduce((n, w) => n + w, 0) || 1;
  const perUnit = own.map((u, i) => ({ unitId: u.id, value: roundValue({ amount: Math.round((result.amount * weights[i]!) / wsum), currency: c }) }));

  const guess = num(get("ownerGuess"));
  const guessMinor = guess * (c === "XOF" ? 1 : 100);
  return {
    kind,
    value: result,
    low: roundValue({ amount: Math.round(result.amount * (1 - spread)), currency: c }),
    high: roundValue({ amount: Math.round(result.amount * (1 + spread)), currency: c }),
    confidence,
    method,
    factors,
    perUnit,
    ownerGapPercent: guessMinor && result.amount ? Math.round(((guessMinor - result.amount) / result.amount) * 100) : undefined,
    missing,
  };
}
