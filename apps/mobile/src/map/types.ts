import type { ReactNode } from "react";
import type { StatusTone } from "@keyo/shared";

export type AssetMarker = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  /** Position normalisée [0..1] pour l'illustration de secours. */
  x: number;
  y: number;
  label?: string;
  tone: StatusTone;
  pin: ReactNode;
};
