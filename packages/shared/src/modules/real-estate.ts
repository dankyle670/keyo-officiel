import { z } from "zod";

/**
 * Module immobilier : contenu de Asset.details et AssetUnit.details quand type = REAL_ESTATE.
 * Tout est facultatif sauf le sous-type : une fiche se complète avec le temps, et chaque champ
 * renseigné améliore l'estimation (l'expertise reprend la fiche et la complète en retour).
 * Les codes sont ceux de l'expertise (appraisal.ts), pour n'avoir qu'une seule source de vérité.
 */
export const RealEstateKind = z.enum(["APARTMENT", "HOUSE", "BUILDING", "COURTYARD", "COMMERCIAL"]);
export type RealEstateKind = z.infer<typeof RealEstateKind>;

export const REAL_ESTATE_KIND_LABEL: Record<RealEstateKind, string> = {
  APARTMENT: "Appartement",
  HOUSE: "Maison, villa",
  BUILDING: "Immeuble",
  COURTYARD: "Cour commune",
  COMMERCIAL: "Local commercial",
};

export const NEIGHBORHOOD_TIER = ["PRIME", "RESIDENTIAL", "POPULAR", "OUTSKIRTS"] as const;
export const BUILT_AGE = ["LT5", "5_15", "15_30", "GT30"] as const;
export const CONDITION = ["NEW", "GOOD", "WORKS", "HEAVY"] as const;
export const FINISH = ["HIGH", "STANDARD", "BASIC"] as const;
export const LEGAL_TITLE = ["TF", "ACD", "CUSTOM", "NONE"] as const;
export const PERMIT = ["YES", "PARTIAL", "NO"] as const;
export const ACCESS = ["PAVED", "DIRT", "HARD"] as const;
/** Équipements communs au bien (immeuble, cour, villa). */
export const AMENITIES = ["GENERATOR", "WATER", "PARKING", "GUARD", "LIFT", "POOL", "GARDEN"] as const;
export const SURROUNDINGS = ["SERVICES", "VIEW", "MAINROAD", "FLOOD", "NOISE"] as const;

export const RealEstateDetails = z.object({
  kind: RealEstateKind,
  /** Prix d'achat, pour le calcul de rentabilité (unités mineures). */
  purchasePrice: z.number().int().nonnegative().optional(),
  purchaseYear: z.number().int().min(1900).max(2100).optional(),
  tier: z.enum(NEIGHBORHOOD_TIER).optional(),
  builtAge: z.enum(BUILT_AGE).optional(),
  condition: z.enum(CONDITION).optional(),
  finish: z.enum(FINISH).optional(),
  legal: z.enum(LEGAL_TITLE).optional(),
  permit: z.enum(PERMIT).optional(),
  access: z.enum(ACCESS).optional(),
  /** Surface du terrain (m²). */
  landM2: z.number().positive().optional(),
  /** Niveaux, rez-de-chaussée compris (un R+3 compte 4 niveaux). */
  floors: z.number().int().positive().max(60).optional(),
  amenities: z.array(z.enum(AMENITIES)).optional(),
  surroundings: z.array(z.enum(SURROUNDINGS)).optional(),
});
export type RealEstateDetails = z.infer<typeof RealEstateDetails>;

export const KITCHEN = ["INSIDE", "OUTSIDE", "NONE"] as const;
export const TOILETS_PLACE = ["INSIDE", "OUTSIDE", "SHARED"] as const;
export const METER = ["INDIVIDUAL", "SHARED"] as const;

export const RealEstateUnitDetails = z.object({
  /** Pièces principales (chambres + salons). Calculé à partir de la composition quand elle est connue. */
  rooms: z.number().int().positive().optional(),
  bedrooms: z.number().int().min(0).max(30).optional(),
  livingRooms: z.number().int().min(0).max(10).optional(),
  /** Douches ou salles d'eau. */
  bathrooms: z.number().int().min(0).max(20).optional(),
  toilets: z.number().int().min(0).max(20).optional(),
  toiletsPlace: z.enum(TOILETS_PLACE).optional(),
  kitchen: z.enum(KITCHEN).optional(),
  surfaceM2: z.number().positive().optional(),
  /** Étage (0 = rez-de-chaussée). */
  floor: z.number().int().min(0).max(60).optional(),
  furnished: z.boolean().optional(),
  /** Nombre de climatiseurs. */
  acUnits: z.number().int().min(0).max(30).optional(),
  balcony: z.boolean().optional(),
  /** Compteurs d'électricité (CIE) et d'eau (SODECI). */
  electricityMeter: z.enum(METER).optional(),
  waterMeter: z.enum(METER).optional(),
  /** Loyer demandé (unités mineures), repris dans le bail à la création. */
  askingRent: z.number().int().nonnegative().optional(),
  /** Charges mensuelles demandées en plus du loyer (unités mineures). */
  charges: z.number().int().nonnegative().optional(),
  /** Valeur estimée du logement (unités mineures). */
  value: z.number().int().nonnegative().optional(),
});
export type RealEstateUnitDetails = z.infer<typeof RealEstateUnitDetails>;

/** Pièces principales d'un logement : chambres + salons si la composition est connue. */
export function roomsOf(d: Partial<RealEstateUnitDetails>): number | undefined {
  if (d.bedrooms !== undefined || d.livingRooms !== undefined) {
    const n = (d.bedrooms ?? 0) + (d.livingRooms ?? 0);
    return n > 0 ? n : undefined;
  }
  return d.rooms;
}

/**
 * Typologie comme on la dit en Côte d'Ivoire : « Studio », « Chambre-salon », « 3 pièces »
 * (2 chambres et 1 salon), avec le détail des pièces d'eau.
 */
export function layoutLabel(d: Partial<RealEstateUnitDetails>): string | undefined {
  const rooms = roomsOf(d);
  if (!rooms) return undefined;
  const b = d.bedrooms;
  const l = d.livingRooms;
  let head = `${rooms} pièce${rooms > 1 ? "s" : ""}`;
  if (b === 0 && rooms === 1) head = "Studio";
  else if (b === 1 && l === 1) head = "Chambre-salon";
  const parts: string[] = [];
  if (b !== undefined && head !== "Studio" && head !== "Chambre-salon") parts.push(`${b} chambre${b > 1 ? "s" : ""}`);
  if (l !== undefined && l > 0 && head !== "Chambre-salon" && head !== "Studio") parts.push(`${l} salon${l > 1 ? "s" : ""}`);
  if (d.bathrooms) parts.push(`${d.bathrooms} douche${d.bathrooms > 1 ? "s" : ""}`);
  if (d.toilets) parts.push(`${d.toilets} toilette${d.toilets > 1 ? "s" : ""}${d.toiletsPlace === "OUTSIDE" ? " extérieure" + (d.toilets > 1 ? "s" : "") : d.toiletsPlace === "SHARED" ? " commune" + (d.toilets > 1 ? "s" : "") : ""}`);
  return parts.length ? `${head} (${parts.join(", ")})` : head;
}

/** Libellés des codes de la fiche, pour l'app et pour l'agent. */
export const REAL_ESTATE_LABELS = {
  tier: { PRIME: "Haut standing", RESIDENTIAL: "Résidentiel", POPULAR: "Populaire", OUTSKIRTS: "Périphérie ou intérieur du pays" },
  builtAge: { LT5: "Moins de 5 ans", "5_15": "5 à 15 ans", "15_30": "15 à 30 ans", GT30: "Plus de 30 ans" },
  condition: { NEW: "Neuf ou rénové", GOOD: "Bon état", WORKS: "Travaux à prévoir", HEAVY: "Gros travaux" },
  finish: { HIGH: "Haut de gamme", STANDARD: "Standard", BASIC: "Basiques" },
  legal: { TF: "Titre foncier", ACD: "ACD", CUSTOM: "Lettre d'attribution ou attestation villageoise", NONE: "Aucun document" },
  permit: { YES: "Oui", PARTIAL: "Oui, niveaux ajoutés depuis", NO: "Non ou ne sait pas" },
  access: { PAVED: "Route bitumée", DIRT: "Voie en terre", HARD: "Accès difficile" },
  amenities: { GENERATOR: "Groupe électrogène", WATER: "Forage ou réserve d'eau", PARKING: "Parking ou garage", GUARD: "Gardien", LIFT: "Ascenseur", POOL: "Piscine", GARDEN: "Jardin ou cour" },
  surroundings: { SERVICES: "Écoles et commerces proches", VIEW: "Vue dégagée ou lagune", MAINROAD: "Sur un axe passant", FLOOD: "Zone inondable", NOISE: "Bruit ou nuisances" },
  kitchen: { INSIDE: "Intérieure", OUTSIDE: "Extérieure", NONE: "Aucune" },
  toiletsPlace: { INSIDE: "Intérieures", OUTSIDE: "Extérieures", SHARED: "Communes" },
  meter: { INDIVIDUAL: "Individuel", SHARED: "Commun" },
} as const;

/**
 * Remplissage de la fiche : caractéristiques du bien utiles à l'estimation, plus la composition et
 * la surface de chaque logement. Sert à inviter le propriétaire à compléter.
 */
export function ficheCompleteness(asset: { details: Record<string, unknown>; location: { country: string } }, units: { details: Record<string, unknown> }[]) {
  const d = asset.details as Partial<RealEstateDetails>;
  const keys: (keyof RealEstateDetails)[] = ["tier", "builtAge", "condition", "finish", "permit", "access", ...(asset.location.country === "CI" ? (["legal"] as const) : [])];
  let done = keys.filter((k) => d[k] !== undefined).length;
  let total = keys.length;
  for (const u of units) {
    const ud = u.details as Partial<RealEstateUnitDetails>;
    total += 2;
    if (roomsOf(ud) || d.kind === "COMMERCIAL") done++;
    if (ud.surfaceM2) done++;
  }
  return { done, total };
}
