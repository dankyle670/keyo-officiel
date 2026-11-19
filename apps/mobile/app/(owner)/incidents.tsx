import { useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { color } from "@keyo/tokens";
import type { AssetEvent } from "@keyo/shared";
import { eventIcon } from "@/data/icons";
import { dayMonth, sinceLabel, slotLabel } from "@/data/period";
import { isOpenEvent } from "@/data/selectors";
import { useOwnerState } from "@/data/store";
import { IconCircle, ListRow, Screen, SectionTitle, Status, Text } from "@/ui";

type Filter = "open" | "resolved";

/** Incidents (05-ProIncidents) : en cours et résolus. */
export default function Incidents() {
  const state = useOwnerState((s) => s);
  const [filter, setFilter] = useState<Filter>("open");
  const open = useMemo(() => state.events.filter((e) => e.kind === "INCIDENT" && isOpenEvent(e)), [state]);
  const resolved = useMemo(
    () => state.events.filter((e) => e.kind === "INCIDENT" && !isOpenEvent(e)).sort((a, b) => (b.resolvedAt ?? "").localeCompare(a.resolvedAt ?? "")),
    [state],
  );
  const assetName = (e: AssetEvent) => state.assets.find((a) => a.id === e.assetId)?.name ?? "";

  const status = (e: AssetEvent) => {
    switch (e.status) {
      case "QUOTES_PENDING":
        return <Status tone="danger" label="Devis à valider" />;
      case "OPEN":
        return <Status tone="late" label="Nouveau" />;
      case "SCHEDULED":
        return <Status tone="info" label={e.scheduledAt ? slotLabel(e.scheduledAt) : "Programmé"} />;
      case "RESOLVED":
        return <Status tone="paid" label="Résolu" />;
    }
  };

  const list = filter === "open" ? open : resolved;

  return (
    <Screen title="Incidents">
      <View style={{ flexDirection: "row", gap: 8, marginTop: 18 }}>
        <LocalChip active={filter === "open"} label={`En cours ${open.length}`} onPress={() => setFilter("open")} />
        <LocalChip active={filter === "resolved"} label={`Résolus ${resolved.length}`} onPress={() => setFilter("resolved")} />
      </View>

      <View style={{ marginTop: 12 }}>
        {list.length === 0 && (
          <Text variant="rowSubtitle" tone="inkMuted" style={{ paddingVertical: 16 }}>
            {filter === "open" ? "Aucun incident en cours." : "Aucun incident résolu pour l'instant."}
          </Text>
        )}
        {list.map((e, i) => (
          <ListRow
            key={e.id}
            divider={i > 0}
            leading={<IconCircle icon={eventIcon(e.category)} bg={isOpenEvent(e) ? "dangerTint" : "surfaceSoft"} fg={isOpenEvent(e) ? "danger" : "ink"} />}
            title={e.title}
            subtitle={`${assetName(e)}, ${e.resolvedAt ? dayMonth(e.resolvedAt) : sinceLabel(e.reportedAt)}`}
            trailing={status(e)}
            onPress={() => router.push(`/incident/${e.id}`)}
          />
        ))}
      </View>

      {filter === "open" && resolved.length > 0 && (
        <>
          <SectionTitle>Résolus récemment</SectionTitle>
          {resolved.slice(0, 2).map((e, i) => (
            <ListRow
              key={e.id}
              divider={i > 0}
              leading={<IconCircle icon={eventIcon(e.category)} />}
              title={e.title}
              subtitle={`${assetName(e)}, ${e.resolvedAt ? dayMonth(e.resolvedAt) : ""}`}
              trailing={status(e)}
              onPress={() => router.push(`/incident/${e.id}`)}
            />
          ))}
        </>
      )}
    </Screen>
  );
}

function LocalChip({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      style={{ height: 40, paddingHorizontal: 16, borderRadius: 999, justifyContent: "center", backgroundColor: active ? color.night : color.surfaceRaised }}
    >
      <Text variant="rowSubtitle" tone={active ? "onNight" : "ink"} style={{ fontFamily: "PlusJakartaSans_700Bold" }}>
        {label}
      </Text>
    </Pressable>
  );
}
