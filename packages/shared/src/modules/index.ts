import type { z } from "zod";
import type { AssetType } from "../domain.ts";
import { RealEstateDetails } from "./real-estate.ts";

export * from "./real-estate.ts";

/** Schéma de `details` par type d'actif. Les types sans module ne sont pas encore ouverts. */
export const DETAILS_SCHEMA: Partial<Record<AssetType, z.ZodType>> = {
  REAL_ESTATE: RealEstateDetails,
};

export const AVAILABLE_ASSET_TYPES = Object.keys(DETAILS_SCHEMA) as AssetType[];
