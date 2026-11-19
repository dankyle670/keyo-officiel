import { View } from "react-native";
import { color } from "@keyo/tokens";
import type { StatusTone } from "@keyo/shared";
import { MapTag } from "@/ui";

/** Repère d'un bien : point vert si tout va bien, étiquette sinon (« ● 1 retard »). */
export function MapPin({ tone, label }: { tone: StatusTone; label?: string }) {
  return (
    <View style={{ alignItems: "center" }}>
      {label ? (
        <MapTag tone={tone} label={label} />
      ) : (
        <View
          style={{
            width: 22,
            height: 22,
            borderRadius: 22,
            backgroundColor: color.mint,
            borderWidth: 4,
            borderColor: color.surfaceRaised,
          }}
        />
      )}
      <View style={{ width: 2, height: 16, backgroundColor: color.night }} />
    </View>
  );
}
