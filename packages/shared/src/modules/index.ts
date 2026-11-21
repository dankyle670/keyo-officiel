import type { z } from "zod";
import type { AssetType } from "../domain.ts";
import { GenericAssetDetails, GenericUnitDetails } from "./catalog.ts";
import { RealEstateDetails, RealEstateUnitDetails } from "./real-estate.ts";

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

/** Schéma de `details` d'une unité par type d'actif (l'immobilier a sa composition propre). */
export const UNIT_DETAILS_SCHEMA: Record<AssetType, z.ZodType<Record<string, unknown>>> = {
  REAL_ESTATE: RealEstateUnitDetails,
  PLANTATION: GenericUnitDetails,
  FARM: GenericUnitDetails,
  VEHICLE: GenericUnitDetails,
  SHOP: GenericUnitDetails,
};

export const AVAILABLE_ASSET_TYPES = Object.keys(DETAILS_SCHEMA) as AssetType[];
