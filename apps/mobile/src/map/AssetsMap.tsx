import Constants, { ExecutionEnvironment } from "expo-constants";
import { View } from "react-native";
import { IsoCity } from "./IsoCity";
import type { AssetMarker } from "./types";

type MapboxModule = typeof import("@rnmapbox/maps");

const TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN;

/**
 * Mapbox demande du code natif : indisponible dans Expo Go. On le charge à la demande et on
 * retombe sur l'illustration isométrique s'il manque, ou si aucun jeton n'est configuré.
 */
function loadMapbox(): MapboxModule | null {
  if (!TOKEN) return null;
  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) return null;
  try {
    const mod = require("@rnmapbox/maps") as MapboxModule;
    mod.default.setAccessToken(TOKEN);
    return mod;
  } catch {
    return null;
  }
}
const Mapbox = loadMapbox();

type Props = {
  markers: AssetMarker[];
  onPressAsset?: (id: string) => void;
  /** Vue rapprochée d'un seul bien (écran de détail). */
  focus?: { lat: number; lng: number };
  /** Espace occupé par les éléments posés sur la carte, pour centrer les biens dans la zone visible. */
  padding?: { top: number; bottom: number };
};

export const hasNativeMap = Mapbox !== null;

export function AssetsMap({ markers, onPressAsset, focus, padding = { top: 0, bottom: 0 } }: Props) {
  if (!Mapbox) {
    return (
      <View style={{ flex: 1, paddingTop: focus ? 0 : padding.top, paddingBottom: focus ? 0 : padding.bottom, backgroundColor: "#E4E9F0" }}>
        <IsoCity markers={markers} onPressAsset={onPressAsset} compact={!!focus} />
      </View>
    );
  }
  const { MapView, Camera, MarkerView, FillExtrusionLayer, StyleURL } = Mapbox.default;
  const lngs = markers.map((m) => m.lng);
  const lats = markers.map((m) => m.lat);

  return (
    <MapView
      style={{ flex: 1 }}
      styleURL={StyleURL.Light}
      scaleBarEnabled={false}
      logoPosition={{ bottom: padding.bottom + 8, left: 12 }}
      attributionPosition={{ bottom: padding.bottom + 8, right: 12 }}
      pitchEnabled
    >
      {focus ? (
        <Camera centerCoordinate={[focus.lng, focus.lat]} zoomLevel={16.2} pitch={60} heading={20} animationDuration={0} />
      ) : (
        <Camera
          bounds={{
            ne: [Math.max(...lngs), Math.max(...lats)],
            sw: [Math.min(...lngs), Math.min(...lats)],
            paddingTop: padding.top + 60,
            paddingBottom: padding.bottom + 40,
            paddingLeft: 60,
            paddingRight: 60,
          }}
          pitch={55}
          heading={-15}
          animationDuration={0}
        />
      )}
      {/* Bâtiments en 3D, aux couleurs de la ville des maquettes */}
      <FillExtrusionLayer
        id="keyo-buildings-3d"
        sourceID="composite"
        sourceLayerID="building"
        minZoomLevel={13}
        maxZoomLevel={24}
        filter={["==", ["get", "extrude"], "true"]}
        style={{
          fillExtrusionColor: "#D3DCE7",
          fillExtrusionHeight: ["get", "height"],
          fillExtrusionBase: ["get", "min_height"],
          fillExtrusionOpacity: 0.9,
        }}
      />
      {markers.map((m) => (
        <MarkerView key={m.id} coordinate={[m.lng, m.lat]} anchor={{ x: 0.5, y: 1 }} allowOverlap>
          <View onTouchEnd={onPressAsset ? () => onPressAsset(m.id) : undefined} accessibilityLabel={m.name}>
            {m.pin}
          </View>
        </MarkerView>
      ))}
    </MapView>
  );
}
