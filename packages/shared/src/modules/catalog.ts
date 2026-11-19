import { z } from "zod";
import type { AssetType } from "../domain.ts";
import { REAL_ESTATE_KIND_LABEL } from "./real-estate.ts";

/**
 * Profil de chaque type d'actif : sous-types, vocabulaire et pièces attendues. Le cœur reste
 * générique (Asset, AssetUnit, Agreement) ; seuls les mots et les champs de `details` changent.
 */
export type AssetProfile = {
  type: AssetType;
  label: string;
  /** Sous-types proposés à la création (stockés dans details.kind). */
  kinds: Record<string, string>;
  unit: { one: string; many: string; feminine: boolean };
  /** Mesure propre à l'unité (pièces, hectares, têtes, m²), stockée dans details sous `key`. */
  measure?: { key: "rooms" | "areaHa" | "capacity" | "surfaceM2"; label: string; suffix: string };
  occupant: { one: string; many: string };
  agreement: { one: string; feminine: boolean };
  /** Nom du montant périodique : loyer, redevance, versement. */
  amount: string;
  /** Pièce de propriété attendue par le contrôle de gestion. */
  titleDoc: string;
  /** État des lieux attendu à l'entrée de l'occupant. */
  needsInventory: boolean;
  /** Enregistrement du contrat auprès des impôts (Côte d'Ivoire). */
  needsRegistration: boolean;
};

export const ASSET_PROFILES: Record<AssetType, AssetProfile> = {
  REAL_ESTATE: {
    type: "REAL_ESTATE",
    label: "Immobilier",
    kinds: REAL_ESTATE_KIND_LABEL,
    unit: { one: "logement", many: "logements", feminine: false },
    measure: { key: "rooms", label: "Pièces", suffix: "pièce(s)" },
    occupant: { one: "locataire", many: "locataires" },
    agreement: { one: "bail", feminine: false },
    amount: "loyer",
    titleDoc: "titre de propriété",
    needsInventory: true,
    needsRegistration: true,
  },
  PLANTATION: {
    type: "PLANTATION",
    label: "Plantation",
    kinds: { COCOA: "Cacao", RUBBER: "Hévéa", CASHEW: "Anacarde", PALM: "Palmier à huile", OTHER: "Autre culture" },
    unit: { one: "parcelle", many: "parcelles", feminine: true },
    measure: { key: "areaHa", label: "Hectares", suffix: "ha" },
    occupant: { one: "exploitant", many: "exploitants" },
    agreement: { one: "contrat d'exploitation", feminine: false },
    amount: "redevance",
    titleDoc: "titre foncier ou certificat foncier",
    needsInventory: false,
    needsRegistration: true,
  },
  FARM: {
    type: "FARM",
    label: "Élevage",
    kinds: { POULTRY: "Volaille", PIGS: "Porcs", CATTLE: "Bovins", FISH: "Pisciculture", OTHER: "Autre élevage" },
    unit: { one: "bâtiment", many: "bâtiments", feminine: false },
    measure: { key: "capacity", label: "Capacité (têtes)", suffix: "têtes" },
    occupant: { one: "gérant", many: "gérants" },
    agreement: { one: "contrat de gestion", feminine: false },
    amount: "versement",
    titleDoc: "titre foncier",
    needsInventory: false,
    needsRegistration: false,
  },
  VEHICLE: {
    type: "VEHICLE",
    label: "Véhicule",
    kinds: { TAXI: "Taxi", VTC: "VTC", MINIBUS: "Minibus", MOTO: "Moto-taxi", TRUCK: "Camion" },
    unit: { one: "véhicule", many: "véhicules", feminine: false },
    occupant: { one: "chauffeur", many: "chauffeurs" },
    agreement: { one: "contrat chauffeur", feminine: false },
    amount: "versement",
    titleDoc: "carte grise",
    needsInventory: false,
    needsRegistration: false,
  },
  SHOP: {
    type: "SHOP",
    label: "Commerce",
    kinds: { BOUTIQUE: "Boutique", RESTAURANT: "Restaurant, maquis", PHARMACY: "Pharmacie", SALON: "Salon", OTHER: "Autre commerce" },
    unit: { one: "local", many: "locaux", feminine: false },
    measure: { key: "surfaceM2", label: "Surface (m²)", suffix: "m²" },
    occupant: { one: "gérant", many: "gérants" },
    agreement: { one: "contrat de gérance", feminine: false },
    amount: "redevance",
    titleDoc: "titre de propriété ou bail commercial",
    needsInventory: true,
    needsRegistration: true,
  },
};

export const ASSET_TYPE_ORDER: AssetType[] = ["REAL_ESTATE", "PLANTATION", "FARM", "VEHICLE", "SHOP"];

export const profileOf = (type: AssetType | string): AssetProfile => ASSET_PROFILES[type as AssetType] ?? ASSET_PROFILES.REAL_ESTATE;

export const kindLabel = (type: AssetType | string, kind: unknown) => profileOf(type).kinds[String(kind)] ?? profileOf(type).label;

export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** details d'un actif hors immobilier : sous-type et prix d'achat. */
export const GenericAssetDetails = z.object({
  kind: z.string().min(1),
  purchasePrice: z.number().int().nonnegative().optional(),
});
export type GenericAssetDetails = z.infer<typeof GenericAssetDetails>;

/** details d'une unité, tous types : mesure éventuelle et montant demandé (unités mineures). */
export const GenericUnitDetails = z.object({
  rooms: z.number().int().positive().optional(),
  areaHa: z.number().positive().optional(),
  capacity: z.number().int().positive().optional(),
  surfaceM2: z.number().positive().optional(),
  askingRent: z.number().int().nonnegative().optional(),
  /** Valeur estimée de l'unité (unités mineures). */
  value: z.number().int().nonnegative().optional(),
});
export type GenericUnitDetails = z.infer<typeof GenericUnitDetails>;
