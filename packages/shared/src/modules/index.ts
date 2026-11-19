import type { z } from "zod";
import type { AssetType } from "../domain.ts";
import { GenericAssetDetails } from "./catalog.ts";
import { RealEstateDetails } from "./real-estate.ts";

export * from "./real-estate.ts";
export * from "./catalog.ts";

/** Schéma de `details` par type d'actif. */
export const DETAILS_SCHEMA: Partial<Record<AssetType, z.ZodType>> = {
  REAL_ESTATE: RealEstateDetails,
  PLANTATION: GenericAssetDetails,
  FARM: GenericAssetDetails,
  VEHICLE: GenericAssetDetails,
  SHOP: GenericAssetDetails,
};

export const AVAILABLE_ASSET_TYPES = Object.keys(DETAILS_SCHEMA) as AssetType[];
