import type { Asset } from "@keyo/shared";
import { boundsOf, normalize } from "@/map/project";
import { MapPin } from "@/map/MapPin";
import type { AssetMarker } from "@/map/types";
import { assetHealth } from "./selectors";
import type { OwnerState } from "./store";

export function buildMarkers(s: OwnerState, assets: Asset[], month: string, today: string): AssetMarker[] {
  const b = boundsOf(assets);
  return assets.map((a) => {
    const health = assetHealth(s, a.id, month, today);
    const { x, y } = normalize(a, b);
    return {
      id: a.id,
      name: a.name,
      lat: a.location.lat,
      lng: a.location.lng,
      x,
      y,
      label: health.mapLabel,
      pin: <MapPin tone={health.tone} label={health.mapLabel} />,
    };
  });
}
