import { useMemo, useState, type ReactElement } from "react";
import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { ChevronDown } from "lucide-react-native";
import { color } from "@keyo/tokens";
import { formatAmount, currencyLabel } from "@keyo/shared";
import { owner } from "@/data/mock";
import { capitalize, currentMonth, dayMonth, monthName, today } from "@/data/period";
import { monthSummary, type RentLine } from "@/data/selectors";
import { useOwnerState } from "@/data/store";
import { Amount, IconCircle, ListRow, Screen, SectionTitle, Status, Text } from "@/ui";

const PREVIEW = 5;

/** Loyers (04-ProLoyers) : progression du mois, en retard, reçus, à venir. */
export default function Rents() {
  const state = useOwnerState((s) => s);
  const month = currentMonth();
  const currency = owner.displayCurrency;
  const s = useMemo(() => monthSummary(state, month, today(), currency), [state, month, currency]);
  const [showAllPaid, setShowAllPaid] = useState(false);
  const total = s.expected.amount || 1;
  const paidShown = showAllPaid ? s.paid : s.paid.slice(0, PREVIEW);

  const row = (l: RentLine, i: number, trailingStatus?: ReactElement) => (
    <ListRow
      key={l.scheduleItemId}
      divider={i > 0}
      leading={
        <IconCircle
          initials={l.initials}
          bg={l.status === "PAID" ? "mintTint" : l.status === "UPCOMING" ? "surfaceSoft" : "amberTint"}
          fg={l.status === "PAID" ? "mintDeep" : l.status === "UPCOMING" ? "ink" : "amber"}
        />
      }
      title={l.partyName}
      subtitle={l.assetName}
      trailing={
        <>
          <Amount value={l.expected} variant="rowTitle" />
          {trailingStatus}
        </>
      }
      onPress={() => router.push(`/bien/${l.assetId}`)}
    />
  );

  return (
    <Screen
      title="Loyers"
      right={
        <Pressable style={{ height: 40, paddingHorizontal: 14, borderRadius: 999, backgroundColor: color.surfaceRaised, flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Text variant="rowSubtitle" style={{ fontFamily: "PlusJakartaSans_700Bold" }}>
            {capitalize(monthName(month))}
          </Text>
          <ChevronDown size={16} strokeWidth={1.8} color={color.inkMuted} />
        </Pressable>
      }
    >
      {/* Barre du mois : reçus, en retard, à venir */}
      <View style={{ marginTop: 22, flexDirection: "row", gap: 4, height: 10 }} accessibilityLabel="Progression des loyers du mois">
        {s.received.amount > 0 && <View style={{ flex: s.received.amount / total, backgroundColor: color.mint, borderTopLeftRadius: 999, borderBottomLeftRadius: 999 }} />}
        {s.lateAmount.amount > 0 && <View style={{ flex: s.lateAmount.amount / total, backgroundColor: color.dotLate }} />}
        {s.upcomingAmount.amount > 0 && <View style={{ flex: s.upcomingAmount.amount / total, backgroundColor: color.track, borderTopRightRadius: 999, borderBottomRightRadius: 999 }} />}
      </View>
      <Text variant="rowSubtitle" tone="inkMuted" style={{ marginTop: 10 }}>
        {formatAmount(s.received)} reçus sur {formatAmount(s.expected)} {currencyLabel(currency)} attendus
      </Text>

      {s.late.length > 0 && (
        <>
          <SectionTitle>En retard</SectionTitle>
          {s.late.map((l, i) => row(l, i, <Status tone="late" label={`${l.daysLate} jour${l.daysLate > 1 ? "s" : ""} de retard`} />))}
        </>
      )}

      <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
        <SectionTitle>Reçus</SectionTitle>
        <Text variant="rowSubtitle" tone="inkMuted">
          {s.paid.length}
        </Text>
      </View>
      {paidShown.map((l, i) => row(l, i))}
      {s.paid.length > PREVIEW && !showAllPaid && (
        <Pressable onPress={() => setShowAllPaid(true)} style={{ paddingVertical: 12 }}>
          <Text variant="rowTitle" tone="sky">
            Voir les {s.paid.length - PREVIEW} autres
          </Text>
        </Pressable>
      )}

      {s.upcoming.length > 0 && (
        <>
          <SectionTitle>À venir</SectionTitle>
          {s.upcoming.map((l, i) => row(l, i, <Status tone="neutral" label={`Le ${dayMonth(l.dueDate)}`} />))}
        </>
      )}
    </Screen>
  );
}
