import { z } from "zod";

/** Module immobilier : contenu de Asset.details et AssetUnit.details quand type = REAL_ESTATE. */
export const RealEstateKind = z.enum(["APARTMENT", "HOUSE", "BUILDING", "COMMERCIAL"]);
export type RealEstateKind = z.infer<typeof RealEstateKind>;

export const RealEstateDetails = z.object({
  kind: RealEstateKind,
  /** Prix d'achat, pour le calcul de rentabilité (unités mineures). */
  purchasePrice: z.number().int().nonnegative().optional(),
});
export type RealEstateDetails = z.infer<typeof RealEstateDetails>;

export const RealEstateUnitDetails = z.object({
  rooms: z.number().int().positive(),
  surfaceM2: z.number().positive().optional(),
  /** Loyer demandé (unités mineures), repris dans le bail à la création. */
  askingRent: z.number().int().nonnegative().optional(),
});
export type RealEstateUnitDetails = z.infer<typeof RealEstateUnitDetails>;

export const REAL_ESTATE_KIND_LABEL: Record<RealEstateKind, string> = {
  APARTMENT: "Appartement",
  HOUSE: "Maison, villa",
  BUILDING: "Immeuble",
  COMMERCIAL: "Local commercial",
};
