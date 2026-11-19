import { useState } from "react";
import Constants, { ExecutionEnvironment } from "expo-constants";
import { View } from "react-native";
import { IsoCity } from "./IsoCity";
import { Map3D } from "./Map3D";
import type { AssetMarker } from "./types";

type MapboxModule = typeof import("@rnmapbox/maps");

const TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN;

/**
 * Trois niveaux, du plus riche au plus robuste :
 * 1. Mapbox natif (development build + jeton) ;
 * 2. MapLibre 3D dans une WebView (Expo Go, réseau requis) ;
 * 3. illustration isométrique (hors ligne, ou si la carte ne charge pas).
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

export function AssetsMap({ markers, onPressAsset, focus, padding = { top: 0, bottom: 0 } }: Props) {
  const [webFailed, setWebFailed] = useState(false);

  if (Mapbox) return <NativeMap mapbox={Mapbox} markers={markers} onPressAsset={onPressAsset} focus={focus} padding={padding} />;

  const fallback = (
    <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, paddingTop: focus ? 0 : padding.top, paddingBottom: focus ? 0 : padding.bottom, backgroundColor: "#E4E9F0" }}>
      <IsoCity markers={markers} onPressAsset={onPressAsset} compact={!!focus} />
    </View>
  );

  return (
    <View style={{ flex: 1 }}>
      {fallback}
      {!webFailed && markers.length > 0 && (
        <Map3D
          markers={markers.map(({ id, name, lat, lng, tone, label }) => ({ id, name, lat, lng, tone, label }))}
          focus={focus}
          padding={padding}
          onPressAsset={onPressAsset}
          onFail={() => setWebFailed(true)}
        />
      )}
    </View>
  );
}

function NativeMap({ mapbox, markers, onPressAsset, focus, padding }: Props & { mapbox: MapboxModule; padding: { top: number; bottom: number } }) {
  const { MapView, Camera, MarkerView, FillExtrusionLayer, StyleURL } = mapbox.default;
  const lngs = markers.map((m) => m.lng);
  const lats = markers.map((m) => m.lat);
  return (
    <MapView style={{ flex: 1 }} styleURL={StyleURL.Light} scaleBarEnabled={false} logoPosition={{ bottom: padding.bottom + 8, left: 12 }} attributionPosition={{ bottom: padding.bottom + 8, right: 12 }} pitchEnabled>
      {focus || markers.length === 1 ? (
        <Camera centerCoordinate={focus ? [focus.lng, focus.lat] : [markers[0]!.lng, markers[0]!.lat]} zoomLevel={16.2} pitch={60} heading={20} animationDuration={0} />
      ) : (
        <Camera
          bounds={{ ne: [Math.max(...lngs), Math.max(...lats)], sw: [Math.min(...lngs), Math.min(...lats)], paddingTop: padding.top + 60, paddingBottom: padding.bottom + 40, paddingLeft: 60, paddingRight: 60 }}
          pitch={55}
          heading={-15}
          animationDuration={0}
        />
      )}
      <FillExtrusionLayer
        id="keyo-buildings-3d"
        sourceID="composite"
        sourceLayerID="building"
        minZoomLevel={13}
        maxZoomLevel={24}
        filter={["==", ["get", "extrude"], "true"]}
        style={{ fillExtrusionColor: "#D3DCE7", fillExtrusionHeight: ["get", "height"], fillExtrusionBase: ["get", "min_height"], fillExtrusionOpacity: 0.9 }}
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
