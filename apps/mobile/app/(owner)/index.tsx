import { useMemo } from "react";
import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Bell, Search, Wallet } from "lucide-react-native";
import { eventIcon } from "@/data/icons";
import { color, radius } from "@keyo/tokens";
import { owner } from "@/data/mock";
import { buildMarkers } from "@/data/markers";
import { currentMonth, monthName, today } from "@/data/period";
import { monthSummary, todoItems } from "@/data/selectors";
import { useOwnerState } from "@/data/store";
import { AssetsMap } from "@/map/AssetsMap";
import { Amount, IconCircle, ListRow, RoundButton, TAB_BAR_CLEARANCE, Text } from "@/ui";

/** Accueil propriétaire (02-Main) : carte 3D des biens, encaissé du mois, liste « À traiter ». */
export default function OwnerHome() {
  const insets = useSafeAreaInsets();
  const state = useOwnerState((s) => s);
  const month = currentMonth();
  const currency = owner.displayCurrency;
  const summary = useMemo(() => monthSummary(state, month, today(), currency), [state, month, currency]);
  const todos = useMemo(() => todoItems(state, month, today(), currency).slice(0, 2), [state, month, currency]);
  const markers = useMemo(() => buildMarkers(state, state.assets, month, today()), [state, month]);
  const ratio = summary.expected.amount > 0 ? summary.received.amount / summary.expected.amount : 0;
  const hour = new Date().getHours();
  const greeting = hour >= 18 || hour < 5 ? "Bonsoir" : "Bonjour";

  return (
    <View style={{ flex: 1, backgroundColor: color.surface }}>
      <View style={{ position: "absolute", inset: 0 }}>
        <AssetsMap markers={markers} onPressAsset={(id) => router.push(`/bien/${id}`)} padding={{ top: insets.top + 240, bottom: 300 }} />
      </View>

      {/* En-tête */}
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 16, gap: 12 }} pointerEvents="box-none">
        <View style={{ flexDirection: "row", gap: 10 }}>
          <View style={{ flex: 1, height: 48, borderRadius: 999, backgroundColor: color.surfaceRaised, flexDirection: "row", alignItems: "center", gap: 12, paddingLeft: 4 }}>
            <IconCircle initials="DK" bg="mint" fg="onMint" diameter={40} />
            <Text variant="heading" numberOfLines={1}>
              {greeting} {owner.firstName}
            </Text>
          </View>
          <RoundButton icon={Search} label="Rechercher" diameter={48} />
          <RoundButton icon={Bell} label="Notifications" diameter={48} />
        </View>

        {/* Encaissé du mois */}
        <Pressable
          onPress={() => router.push("/(owner)/loyers")}
          accessibilityRole="button"
          style={{ backgroundColor: color.night, borderRadius: radius.card, padding: 20, overflow: "hidden" }}
        >
          <View style={{ position: "absolute", right: -30, bottom: -30, width: 120, height: 120, borderRadius: 120, backgroundColor: color.nightSoft }} />
          <Text variant="rowSubtitle" style={{ color: "#B8C3D6" }}>
            Encaissé en {monthName(month)}
          </Text>
          <View style={{ marginTop: 4 }}>
            <Amount value={summary.received} variant="amount" tone="onNight" currencyTone="onNight" />
          </View>
          <View style={{ marginTop: 14, flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View style={{ flex: 1, height: 6, borderRadius: 6, backgroundColor: color.nightSoft }}>
              <View style={{ width: `${Math.round(ratio * 100)}%`, height: 6, borderRadius: 6, backgroundColor: color.mint }} />
            </View>
            <Text variant="status" style={{ color: "#B8C3D6" }}>
              {summary.paid.length} sur {summary.lines.length}
            </Text>
          </View>
        </Pressable>
      </View>

      {/* À traiter */}
      <View
        style={{
          position: "absolute",
          left: 12,
          right: 12,
          bottom: TAB_BAR_CLEARANCE + insets.bottom - 18,
          backgroundColor: color.surfaceRaised,
          borderRadius: radius.sheet,
          paddingHorizontal: 18,
          paddingTop: 18,
          paddingBottom: 6,
        }}
      >
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <Text variant="section" accessibilityRole="header">
            À traiter
          </Text>
          <Pressable onPress={() => router.push("/(owner)/loyers")} hitSlop={8}>
            <Text variant="rowTitle" tone="sky">
              Tout voir
            </Text>
          </Pressable>
        </View>
        {todos.length === 0 ? (
          <Text variant="rowSubtitle" tone="inkMuted" style={{ paddingVertical: 16 }}>
            Rien à traiter. Tous vos loyers sont à jour.
          </Text>
        ) : (
          todos.map((t, i) =>
            t.kind === "late" ? (
              <ListRow
                key={t.id}
                divider={i > 0}
                leading={<IconCircle icon={Wallet} bg="amberTint" fg="amber" />}
                title={t.title}
                subtitle={t.subtitle}
                trailing={<Amount value={t.amount} variant="rowTitle" />}
                onPress={() => router.push(`/bien/${t.assetId}`)}
              />
            ) : (
              <ListRow
                key={t.id}
                divider={i > 0}
                leading={<IconCircle icon={eventIcon(t.category)} bg="dangerTint" fg="danger" />}
                title={t.title}
                subtitle={t.subtitle}
                chevron
                onPress={() => router.push(`/incident/${t.eventId}`)}
              />
            ),
          )
        )}
      </View>
    </View>
  );
}
