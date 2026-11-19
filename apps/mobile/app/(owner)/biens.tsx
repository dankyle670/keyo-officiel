import { useMemo } from "react";
import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { Plus } from "lucide-react-native";
import { color } from "@keyo/tokens";
import { assetKindIcon } from "@/data/icons";
import { currentMonth, today } from "@/data/period";
import { assetHealth, assetSummary } from "@/data/selectors";
import { useOwnerState } from "@/data/store";
import { Amount, Button, IconCircle, ListRow, Screen, Status, Text } from "@/ui";

/** Mes biens (10-AndroidBiens, adapté à l'iPhone) : liste aérée, statut et loyer mensuel. */
export default function AssetsList() {
  const state = useOwnerState((s) => s);
  const rows = useMemo(
    () =>
      state.assets.map((a) => ({
        asset: a,
        summary: assetSummary(state, a),
        health: assetHealth(state, a.id, currentMonth(), today()),
      })),
    [state],
  );
  const unitCount = rows.reduce((n, r) => n + r.summary.units.length, 0);

  return (
    <Screen
      title="Mes biens"
      right={
        <Pressable
          onPress={() => router.push("/bien/nouveau")}
          accessibilityRole="button"
          accessibilityLabel="Ajouter un bien"
          style={{ width: 44, height: 44, borderRadius: 44, backgroundColor: color.night, alignItems: "center", justifyContent: "center" }}
        >
          <Plus size={22} strokeWidth={1.8} color={color.onNight} />
        </Pressable>
      }
    >
      <Text variant="rowSubtitle" tone="inkMuted" style={{ marginTop: 6, marginBottom: 16 }}>
        {rows.length} bien{rows.length > 1 ? "s" : ""}, {unitCount} logement{unitCount > 1 ? "s" : ""}
      </Text>

      {rows.length === 0 ? (
        <View style={{ gap: 16, marginTop: 24 }}>
          <Text variant="body" tone="inkMuted">
            Ajoutez votre premier bien pour suivre ses loyers et ses incidents.
          </Text>
          <Button label="Ajouter un bien" icon={Plus} onPress={() => router.push("/bien/nouveau")} />
        </View>
      ) : (
        rows.map(({ asset, summary, health }, i) => (
          <ListRow
            key={asset.id}
            divider={i > 0}
            leading={<IconCircle icon={assetKindIcon(asset.details.kind)} />}
            title={asset.name}
            subtitle={`${asset.location.address.split(",")[0]} · ${summary.units.length} logement${summary.units.length > 1 ? "s" : ""}`}
            trailing={
              <>
                <Amount value={summary.monthlyRent} variant="rowTitle" />
                <Status tone={health.tone} label={health.label} />
              </>
            }
            onPress={() => router.push(`/bien/${asset.id}`)}
          />
        ))
      )}
    </Screen>
  );
}
