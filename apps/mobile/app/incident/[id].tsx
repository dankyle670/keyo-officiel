import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Camera, ChevronLeft, Sparkles } from "lucide-react-native";
import { formatMoney } from "@keyo/shared";
import { color, radius } from "@keyo/tokens";
import { NOW } from "@/data/mock";
import { dayMonth, slotLabel } from "@/data/period";
import { partyName } from "@/data/selectors";
import { actions, useOwnerState } from "@/data/store";
import { Amount, Button, RoundButton, Status, Text } from "@/ui";

const URGENCY = {
  HIGH: { tone: "danger", label: "À traiter sous 48 h" },
  MEDIUM: { tone: "late", label: "Urgence moyenne" },
  LOW: { tone: "neutral", label: "Peu urgent" },
} as const;

/** Incident (06-ProIncident) : photo, analyse IA, choix d'un devis, validation. */
export default function IncidentDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const state = useOwnerState((s) => s);
  const event = state.events.find((e) => e.id === id);
  const [selected, setSelected] = useState<string | undefined>(event?.quotes[0]?.id);

  if (!event) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
        <Text variant="body">Cet incident est introuvable.</Text>
      </View>
    );
  }

  const asset = state.assets.find((a) => a.id === event.assetId);
  const reporter = event.reportedBy ? partyName(state, event.reportedBy) : asset?.name;
  const quote = event.quotes.find((q) => q.id === selected);
  const canChoose = event.status === "QUOTES_PENDING";
  const statusLine =
    event.status === "RESOLVED"
      ? { tone: "paid" as const, label: `Résolu le ${dayMonth(event.resolvedAt ?? event.reportedAt)}` }
      : event.status === "SCHEDULED" && event.scheduledAt
        ? { tone: "info" as const, label: `Intervention ${slotLabel(event.scheduledAt, NOW).toLowerCase()}` }
        : URGENCY[event.urgency];

  return (
    <View style={{ flex: 1, backgroundColor: color.surface }}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 110 }}>
        {/* Photos envoyées par le locataire */}
        <View style={{ height: 300, backgroundColor: "#DCE5EE", alignItems: "center", justifyContent: "center", gap: 10 }}>
          <Camera size={40} strokeWidth={1.8} color="#8C9BB0" />
          <Text variant="rowSubtitle" style={{ color: "#8C9BB0" }}>
            {event.photos.length ? `Photo envoyée par ${reporter}` : "Aucune photo"}
          </Text>
          {event.photos.length > 1 && (
            <View style={{ position: "absolute", right: 16, bottom: 16, backgroundColor: color.scrim, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 }}>
              <Text variant="status" tone="onNight">
                1 / {event.photos.length}
              </Text>
            </View>
          )}
          <View style={{ position: "absolute", top: insets.top + 6, left: 16 }}>
            <RoundButton icon={ChevronLeft} label="Retour" onPress={() => router.back()} />
          </View>
        </View>

        <View style={{ padding: 24, gap: 14 }}>
          <Status tone={statusLine.tone} label={statusLine.label} />
          <Text variant="display" accessibilityRole="header">
            {event.description}
          </Text>
          {asset && (
            <Text variant="rowSubtitle" tone="inkMuted">
              {asset.name}
            </Text>
          )}
          {event.aiSummary && (
            <View style={{ flexDirection: "row", gap: 12 }}>
              <Sparkles size={22} strokeWidth={1.8} color={color.mintDeep} />
              <Text variant="body" style={{ flex: 1 }}>
                {event.aiSummary}
              </Text>
            </View>
          )}

          {event.quotes.length > 0 && (
            <>
              <Text variant="section" style={{ marginTop: 16 }}>
                {canChoose ? "Choisir un devis" : "Devis retenu"}
              </Text>
              {event.quotes.map((q) => {
                const active = q.id === selected || !canChoose;
                return (
                  <Pressable
                    key={q.id}
                    disabled={!canChoose}
                    onPress={() => setSelected(q.id)}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: active }}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 16,
                      backgroundColor: color.surfaceRaised,
                      borderRadius: radius.card,
                      padding: 18,
                      borderWidth: 2,
                      borderColor: active && canChoose ? color.mint : "transparent",
                    }}
                  >
                    {canChoose && (
                      <View style={{ width: 22, height: 22, borderRadius: 22, borderWidth: 1.5, borderColor: active ? color.mintDeep : color.inkMuted, alignItems: "center", justifyContent: "center" }}>
                        {active && <View style={{ width: 12, height: 12, borderRadius: 12, backgroundColor: color.mintDeep }} />}
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text variant="rowTitle">{q.provider}</Text>
                      <Text variant="rowSubtitle" tone="inkMuted">
                        {slotLabel(q.slot, NOW)}, note {String(q.rating).replace(".", ",")}
                      </Text>
                    </View>
                    <Amount value={q.amount} variant="rowTitle" />
                  </Pressable>
                );
              })}
            </>
          )}
        </View>
      </ScrollView>

      {canChoose && quote && (
        <View style={{ position: "absolute", left: 24, right: 24, bottom: insets.bottom + 16 }}>
          <Button
            label={`Valider le devis de ${formatMoney(quote.amount)}`}
            onPress={() => {
              actions.approveQuote(event.id, quote.id);
            }}
          />
        </View>
      )}
    </View>
  );
}
