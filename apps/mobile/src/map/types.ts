import type { ReactNode } from "react";

export type AssetMarker = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  /** Position normalisée [0..1] pour l'illustration de secours. */
  x: number;
  y: number;
  label?: string;
  pin: ReactNode;
};
