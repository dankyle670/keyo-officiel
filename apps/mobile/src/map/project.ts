import type { Asset } from "@keyo/shared";

export type Bounds = { minLat: number; maxLat: number; minLng: number; maxLng: number };

export function boundsOf(assets: Asset[]): Bounds {
  const lats = assets.map((a) => a.location.lat);
  const lngs = assets.map((a) => a.location.lng);
  return { minLat: Math.min(...lats), maxLat: Math.max(...lats), minLng: Math.min(...lngs), maxLng: Math.max(...lngs) };
}

/** Projette une position dans un rectangle [0..1]², nord en haut, avec une marge. */
export function normalize(asset: Asset, b: Bounds, margin = 0.12) {
  const w = b.maxLng - b.minLng || 1;
  const h = b.maxLat - b.minLat || 1;
  const x = (asset.location.lng - b.minLng) / w;
  const y = 1 - (asset.location.lat - b.minLat) / h;
  return { x: margin + x * (1 - 2 * margin), y: margin + y * (1 - 2 * margin) };
}
