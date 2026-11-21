import type { Agreement, Asset, AssetUnit, Document } from "./domain.ts";
import type { Currency, Money } from "./money.ts";
import { roundValue, valueAsset } from "./valuation.ts";
import { AMENITIES, roomsOf, SURROUNDINGS, type RealEstateDetails, type RealEstateUnitDetails } from "./modules/real-estate.ts";

/**
 * Expertise Keyo : l'entretien qu'un expert immobilier ou agricole mènerait, puis une estimation
 * par comparaison (prix au m² ou à l'hectare, ajustés par l'état, la situation juridique, l'accès…).
 * Déterministe et testé : l'agent pose les questions et s'appuie sur ce calcul, sans inventer de prix.
 * Ouvert aux maisons, appartements, immeubles de rapport et plantations. Un immeuble croise deux
 * méthodes d'expert : capitalisation du revenu net (méthode principale quand il est loué) et
 * comparaison (surface bâtie et terrain).
 * Les barèmes sont des repères de marché indicatifs, à remplacer par des prix réels par quartier.
 */
export type AppraisalKind = "HOUSE" | "APARTMENT" | "BUILDING" | "PLANTATION";

export function appraisalKind(a: Asset): AppraisalKind | null {
  if (a.type === "PLANTATION") return "PLANTATION";
  if (a.type === "REAL_ESTATE" && (a.details.kind === "HOUSE" || a.details.kind === "APARTMENT" || a.details.kind === "BUILDING")) return a.details.kind;
  // Une cour commune s'estime comme un immeuble de rapport : par ses loyers et par comparaison.
  if (a.type === "REAL_ESTATE" && a.details.kind === "COURTYARD") return "BUILDING";
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

/** Contrats en cours du bien à une date. */
const activeLeases = (a: Asset, agreements: Agreement[], today: string) => agreements.filter((g) => g.assetId === a.id && g.startDate <= today && (!g.endDate || g.endDate >= today));

/** Loyers mensuels de l'immeuble s'il était entièrement loué : contrats en cours, sinon loyer demandé. Unité principale (FCFA, euros). */
function potentialRent(a: Asset, own: AssetUnit[], leases: Agreement[]) {
  const minor = own.reduce((n, u) => {
    const g = leases.find((x) => x.unitId === u.id);
    return n + (g ? g.periodicAmount.amount : typeof u.details.askingRent === "number" ? u.details.askingRent : 0);
  }, 0);
  return a.currency === "XOF" ? minor : Math.round(minor / 100);
}

function buildingQuestions(a: Asset, own: AssetUnit[], leases: Agreement[]): AppraisalQuestion[] {
  const ci = a.location.country === "CI";
  const surface = own.reduce((n, u) => n + (typeof u.details.surfaceM2 === "number" ? u.details.surfaceM2 : 0), 0);
  const rent = potentialRent(a, own, leases);
  const occupied = own.length ? own.filter((u) => leases.some((g) => g.unitId === u.id)).length / own.length : 0;
  const cur = a.currency === "XOF" ? "FCFA" : a.currency;
  return [
    { id: "tier", ask: "Dans quel type de quartier se trouve l'immeuble ?", type: "choice", options: ci ? TIERS_CI : TIERS_FR },
    {
      id: "use",
      ask: "À quoi sert l'immeuble ?",
      type: "choice",
      options: [opt("RESIDENTIAL", "Logements uniquement"), opt("MIXED", "Commerces au rez-de-chaussée, logements au-dessus"), opt("OFFICE", "Bureaux ou commerces")],
    },
    { id: "floors", ask: "Combien de niveaux, rez-de-chaussée compris ?", hint: "Un R+3 compte 4 niveaux.", type: "number" },
    { id: "unitsCount", ask: "Combien de logements ou de locaux compte-t-il ?", type: "number", prefill: own.length || undefined },
    { id: "surface", ask: "Quelle est la surface bâtie totale, tous niveaux ?", hint: "La somme des surfaces de tous les logements et locaux.", type: "number", unit: "m²", prefill: surface || undefined },
    { id: "land", ask: "Et la surface du terrain ?", hint: "Passez si vous ne la connaissez pas.", type: "number", unit: "m²", optional: true },
    {
      id: "monthlyRent",
      ask: "Combien rapporteraient les loyers chaque mois si tout était loué ?",
      hint: "Total de tous les logements et locaux, charges non comprises.",
      type: "number",
      unit: cur,
      prefill: rent || undefined,
    },
    {
      id: "occupancy",
      ask: "En général, quelle part est louée sur l'année ?",
      type: "choice",
      options: [opt("FULL", "Presque toujours tout loué (plus de 90 %)"), opt("MOST", "La plupart du temps (70 à 90 %)"), opt("HALF", "Souvent des logements vides (moins de 70 %)")],
      prefill: own.length ? (occupied >= 0.9 ? "FULL" : occupied >= 0.7 ? "MOST" : "HALF") : undefined,
    },
    {
      id: "charges",
      ask: "Combien coûtent l'entretien, le gardiennage et les taxes chaque année ?",
      hint: "Facultatif. Sans réponse, l'expert retient 20 % des loyers.",
      type: "number",
      unit: cur,
      optional: true,
    },
    {
      id: "age",
      ask: "Quand a-t-il été construit ?",
      type: "choice",
      options: [opt("LT5", "Il y a moins de 5 ans"), opt("5_15", "Entre 5 et 15 ans"), opt("15_30", "Entre 15 et 30 ans"), opt("GT30", "Il y a plus de 30 ans")],
    },
    { id: "condition", ask: "Dans quel état sont la structure et les parties communes ?", type: "choice", options: [opt("NEW", "Neuf ou rénové"), opt("GOOD", "Bon état"), opt("WORKS", "Travaux à prévoir"), opt("HEAVY", "Gros travaux (fissures, étanchéité)")] },
    { id: "finish", ask: "Et les finitions des logements ?", type: "choice", options: [opt("HIGH", "Haut de gamme"), opt("STANDARD", "Standard"), opt("BASIC", "Basiques")] },
    {
      id: "equipment",
      ask: "Quels équipements l'immeuble possède-t-il ?",
      hint: "Plusieurs réponses possibles.",
      type: "multi",
      optional: true,
      options: [opt("LIFT", "Ascenseur"), opt("GENERATOR", "Groupe électrogène"), opt("WATER", "Forage ou bâche à eau"), opt("PARKING", "Parking ou sous-sol"), opt("GUARD", "Gardiennage"), opt("METERS", "Compteurs d'eau et d'électricité individuels")],
    },
    ...(ci
      ? [
          {
            id: "legal",
            ask: "Quel document prouve la propriété du terrain ?",
            type: "choice" as const,
            options: [opt("TF", "Titre foncier"), opt("ACD", "ACD (arrêté de concession définitive)"), opt("CUSTOM", "Lettre d'attribution ou attestation villageoise"), opt("NONE", "Aucun document")],
          },
        ]
      : []),
    { id: "permit", ask: "L'immeuble a-t-il un permis de construire ?", type: "choice", options: [opt("YES", "Oui, conforme à la construction"), opt("PARTIAL", "Oui, mais des niveaux ont été ajoutés"), opt("NO", "Non ou je ne sais pas")] },
    { id: "access", ask: "Comment est la voie d'accès ?", type: "choice", options: [opt("PAVED", "Route bitumée"), opt("DIRT", "Voie en terre praticable"), opt("HARD", "Accès difficile")] },
    {
      id: "surroundings",
      ask: "Quelque chose de particulier dans l'environnement ?",
      hint: "Plusieurs réponses possibles.",
      type: "multi",
      optional: true,
      options: [opt("MAINROAD", "Sur un axe passant (bon pour les commerces)"), opt("SERVICES", "Proche écoles et commerces"), opt("FLOOD", "Zone inondable"), opt("NOISE", "Bruit ou nuisances")],
    },
    { id: "ownerGuess", ask: "Selon vous, combien vaut-il ?", hint: "Facultatif. Cela permet de comparer avec l'estimation.", type: "number", unit: cur, optional: true },
  ];
}

/**
 * Réponses déjà connues grâce à la fiche du bien (caractéristiques et composition des logements).
 * L'expert ne les redemande pas : il les fait confirmer.
 */
export function ficheAnswers(a: Asset, units: AssetUnit[]): AppraisalAnswers {
  if (a.type !== "REAL_ESTATE") return {};
  const d = a.details as Partial<RealEstateDetails>;
  const own = units.filter((u) => u.assetId === a.id).map((u) => u.details as Partial<RealEstateUnitDetails>);
  const out: AppraisalAnswers = { tier: d.tier, age: d.builtAge, condition: d.condition, finish: d.finish, legal: d.legal, permit: d.permit, access: d.access, land: d.landM2, floors: d.floors };
  const surface = own.reduce((n, u) => n + (u.surfaceM2 ?? 0), 0);
  if (surface > 0 && own.every((u) => u.surfaceM2)) out.surface = surface;
  const rooms = own.reduce((n, u) => n + (roomsOf(u) ?? 0), 0);
  if (rooms > 0) out.rooms = rooms;
  const equipment = new Set<string>(d.amenities ?? []);
  if (own.some((u) => (u.acUnits ?? 0) > 0)) equipment.add("AC");
  if (own.some((u) => u.balcony)) equipment.add("TERRACE");
  if (own.length && own.every((u) => u.electricityMeter === "INDIVIDUAL")) equipment.add("METERS");
  if (equipment.size) out.equipment = [...equipment];
  if (d.surroundings?.length) out.surroundings = [...d.surroundings];
  const floor = own.length === 1 ? own[0]!.floor : undefined;
  if (floor !== undefined) out.floor = floor === 0 ? "GROUND" : floor <= 3 ? "LOW" : d.amenities?.includes("LIFT") ? "HIGH_LIFT" : "HIGH_NOLIFT";
  return Object.fromEntries(Object.entries(out).filter(([, v]) => v !== undefined && v !== null));
}

/**
 * Inverse : ce que l'entretien d'expert apprend sur le bien, à reporter sur sa fiche (le logement
 * aussi quand le bien n'en a qu'un). Les réponses passées ou inconnues ne changent rien.
 */
export function ficheFromAnswers(a: Asset, answers: AppraisalAnswers): { asset: Partial<RealEstateDetails>; unit: Partial<RealEstateUnitDetails> } {
  if (a.type !== "REAL_ESTATE") return { asset: {}, unit: {} };
  const str = (k: string, allowed: readonly string[]) => (typeof answers[k] === "string" && allowed.includes(answers[k] as string) ? (answers[k] as string) : undefined);
  const pos = (k: string) => (typeof answers[k] === "number" && (answers[k] as number) > 0 ? (answers[k] as number) : undefined);
  const arr = (k: string, allowed: readonly string[]) => (Array.isArray(answers[k]) ? (answers[k] as string[]).filter((x) => allowed.includes(x)) : undefined);
  const asset = {
    tier: str("tier", ["PRIME", "RESIDENTIAL", "POPULAR", "OUTSKIRTS"]),
    builtAge: str("age", ["LT5", "5_15", "15_30", "GT30"]),
    condition: str("condition", ["NEW", "GOOD", "WORKS", "HEAVY"]),
    finish: str("finish", ["HIGH", "STANDARD", "BASIC"]),
    legal: str("legal", ["TF", "ACD", "CUSTOM", "NONE"]),
    permit: str("permit", ["YES", "PARTIAL", "NO"]),
    access: str("access", ["PAVED", "DIRT", "HARD"]),
    landM2: pos("land"),
    floors: pos("floors") ? Math.round(pos("floors")!) : undefined,
    amenities: arr("equipment", AMENITIES),
    surroundings: arr("surroundings", SURROUNDINGS),
  } as Partial<RealEstateDetails>;
  const equipment = Array.isArray(answers.equipment) ? (answers.equipment as string[]) : [];
  const unit: Partial<RealEstateUnitDetails> = {
    surfaceM2: pos("surface"),
    rooms: pos("rooms") ? Math.round(pos("rooms")!) : undefined,
    balcony: equipment.includes("TERRACE") || undefined,
    floor: answers.floor === "GROUND" ? 0 : undefined,
  };
  const clean = <T extends object>(o: T) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && !(Array.isArray(v) && v.length === 0))) as Partial<T>;
  return { asset: clean(asset), unit: clean(unit) };
}

/** `agreements` et `today` servent à préremplir les loyers d'un immeuble ; la fiche, le reste. */
export function appraisalQuestions(a: Asset, units: AssetUnit[], agreements: Agreement[] = [], today = new Date().toISOString().slice(0, 10)): AppraisalQuestion[] {
  const known = ficheAnswers(a, units);
  return baseQuestions(a, units, agreements, today).map((q) => {
    if (q.prefill !== undefined) return q;
    const v = known[q.id];
    if (v === undefined || v === null) return q;
    if (q.type === "choice") return typeof v === "string" && q.options?.some((o) => o.value === v) ? { ...q, prefill: v } : q;
    if (q.type === "multi") {
      const ok = Array.isArray(v) ? v.filter((x) => q.options?.some((o) => o.value === x)) : [];
      return ok.length ? { ...q, prefill: ok } : q;
    }
    return typeof v === "number" ? { ...q, prefill: v } : q;
  });
}

function baseQuestions(a: Asset, units: AssetUnit[], agreements: Agreement[] = [], today = new Date().toISOString().slice(0, 10)): AppraisalQuestion[] {
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
  if (kind === "BUILDING") return buildingQuestions(a, own, activeLeases(a, agreements, today));
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
/**
 * Taux de rendement brut retenus par les experts pour un immeuble de rapport, selon le quartier :
 * plus le quartier est sûr et recherché, plus le taux est bas (et la valeur haute). Repères indicatifs.
 */
const CAP_RATE: Record<"CI" | "EU", Record<string, number>> = {
  CI: { PRIME: 0.08, RESIDENTIAL: 0.09, POPULAR: 0.105, OUTSKIRTS: 0.12 },
  EU: { PRIME: 0.04, RESIDENTIAL: 0.05, POPULAR: 0.06, OUTSKIRTS: 0.07 },
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
  const questions = appraisalQuestions(a, input.units, input.agreements, input.today);
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
  } else if (kind === "BUILDING") {
    const zone = a.location.country === "CI" ? "CI" : "EU";
    const conv = (x: number) => (zone === "CI" ? fromXof(x, c) : c === "XOF" ? Math.round((x / 100) * XOF_PER_EUR) : x);
    const major = (n: number) => n * (c === "XOF" ? 1 : 100);
    const tier = get("tier");
    const use = String(get("use") ?? "RESIDENTIAL");
    const surface = num(get("surface"));
    factors.push({ label: `${label("tier")}, ${label("use").toLowerCase()}`, effect: `${surface.toLocaleString("fr-FR")} m² bâtis` });

    // 1. Comparaison : surface bâtie au prix du quartier (un immeuble se négocie sous le prix d'un logement seul), plus le terrain.
    let building = surface * conv(pick(HOME_M2[zone], tier, HOME_M2[zone].RESIDENTIAL!)) * 0.85;
    building *= pick({ RESIDENTIAL: 1, MIXED: 1.05, OFFICE: 1.1 }, use);
    building *= apply(`Construit ${label("age").toLowerCase()}`, pick({ LT5: 1, "5_15": 0.92, "15_30": 0.8, GT30: 0.68 }, get("age")));
    building *= apply(`État : ${label("condition").toLowerCase()}`, pick({ NEW: 1.08, GOOD: 1, WORKS: 0.85, HEAVY: 0.65 }, get("condition")));
    building *= apply(`Finitions : ${label("finish").toLowerCase()}`, pick({ HIGH: 1.15, STANDARD: 1, BASIC: 0.85 }, get("finish")));
    const landM2 = num(get("land"));
    const land = landM2 * conv(pick(LAND_M2[zone], tier, LAND_M2[zone].RESIDENTIAL!));
    if (land) factors.push({ label: `Terrain de ${landM2.toLocaleString("fr-FR")} m²`, effect: "valeur du foncier ajoutée" });
    let comparison = building + land;
    const EQ: Record<string, number> = { LIFT: 0.03, GENERATOR: 0.02, WATER: 0.02, PARKING: 0.03, GUARD: 0.01, METERS: 0.02 };
    const eqPct = list(get("equipment")).reduce((n, e) => n + (EQ[String(e)] ?? 0), 0);
    if (eqPct) comparison *= 1 + eqPct;

    // 2. Rendement : loyers annuels × occupation − charges, divisés par le taux du quartier.
    const gross = major(num(get("monthlyRent"))) * 12;
    const occ = pick({ FULL: 0.95, MOST: 0.82, HALF: 0.62 }, get("occupancy"), 0.85);
    const charges = get("charges") !== undefined && get("charges") !== null && get("charges") !== "" ? major(num(get("charges"))) : gross * occ * 0.2;
    const net = Math.max(0, gross * occ - charges);
    let rate = pick(CAP_RATE[zone], tier, CAP_RATE[zone].RESIDENTIAL!);
    if (use === "MIXED") rate -= 0.005;
    if (get("condition") === "WORKS") rate += 0.005;
    if (get("condition") === "HEAVY") rate += 0.015;
    const income = rate > 0 ? net / rate : 0;
    if (gross) factors.push({ label: `Loyers de ${(gross / (c === "XOF" ? 1 : 100)).toLocaleString("fr-FR")} ${c === "XOF" ? "FCFA" : c} par an`, effect: `occupation ${Math.round(occ * 100)} %, rendement retenu ${(rate * 100).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %` });

    // Pondération d'expert : le rendement prime pour un immeuble loué.
    value = income ? income * 0.6 + comparison * 0.4 : comparison;
    if (income) factors.push({ label: "Pondération", effect: "rendement 60 %, comparaison 40 %" });

    if (eqPct) factors.push({ label: "Équipements", effect: pct(1 + eqPct) });
    if (zone === "CI") value *= apply(`Propriété : ${label("legal")}`, pick({ TF: 1, ACD: 0.97, CUSTOM: 0.75, NONE: 0.6 }, get("legal")));
    value *= apply(`Permis : ${label("permit").toLowerCase()}`, pick({ YES: 1, PARTIAL: 0.92, NO: 0.85 }, get("permit")));
    value *= apply(`Accès : ${label("access").toLowerCase()}`, pick({ PAVED: 1, DIRT: 0.92, HARD: 0.8 }, get("access")));
    const env = list(get("surroundings"));
    if (env.includes("MAINROAD") && use !== "RESIDENTIAL") value *= apply("Axe passant", 1.05);
    if (env.includes("SERVICES")) value *= apply("Proche des commodités", 1.03);
    if (env.includes("FLOOD")) value *= apply("Zone inondable", 0.85);
    if (env.includes("NOISE")) value *= apply("Nuisances", 0.95);
    method = income
      ? "Capitalisation du revenu net (loyers, occupation et charges, au taux de rendement du quartier), croisée avec la valeur par comparaison (surface bâtie et terrain), puis ajustée par la situation juridique, le permis et l'accès."
      : "Comparaison : surface bâtie et terrain au prix du quartier, ajustés par l'âge, l'état, l'usage, les équipements, la situation juridique, le permis et l'accès. Sans loyers connus, la méthode par le rendement n'a pas pu être appliquée.";
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
  const income = kind === "BUILDING" ? null : valueAsset(input).incomeValue;
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
  // Immeuble : au loyer de chaque logement (contrat en cours, sinon loyer demandé).
  const leases = activeLeases(a, input.agreements, input.today);
  const rentOf = (u: AssetUnit) => leases.find((g) => g.unitId === u.id)?.periodicAmount.amount ?? (typeof u.details.askingRent === "number" ? u.details.askingRent : 0);
  const weights = own.map((u) => num(kind === "PLANTATION" ? u.details.areaHa : kind === "BUILDING" ? rentOf(u) : 1) || 1);
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
