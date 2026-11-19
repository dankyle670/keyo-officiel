import { useMemo, useState, type ReactElement } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { router } from "expo-router";
import { ChevronDown } from "lucide-react-native";
import { addMonths, currencyLabel, formatAmount } from "@keyo/shared";
import { color, fontFamily } from "@keyo/tokens";
import { capitalize, currentMonth, dayMonth, monthName, today } from "@/data/period";
import { monthSummary, type RentLine } from "@/data/selectors";
import { useUser } from "@/data/session";
import { useOwnerState } from "@/data/store";
import { Amount, Chip, EmptyState, IconCircle, ListRow, Screen, SectionTitle, Sheet, SheetAction, Status, Text } from "@/ui";

const PREVIEW = 5;
type Filter = "all" | "late" | "paid" | "upcoming";

/** Loyers (04-ProLoyers) : progression du mois, en retard, reçus, à venir. Choix du mois et filtres. */
export default function Rents() {
  const user = useUser();
  const state = useOwnerState((s) => s);
  const [month, setMonth] = useState(currentMonth());
  const [filter, setFilter] = useState<Filter>("all");
  const [picker, setPicker] = useState(false);
  const [showAllPaid, setShowAllPaid] = useState(false);
  const currency = user.displayCurrency;
  const s = useMemo(() => monthSummary(state, month, today(), currency), [state, month, currency]);
  const total = s.expected.amount || 1;
  const paidShown = showAllPaid || filter === "paid" ? s.paid : s.paid.slice(0, PREVIEW);
  const months = useMemo(() => Array.from({ length: 12 }, (_, i) => addMonths(currentMonth(), 1 - i)), []);
  const show = (f: Filter) => filter === "all" || filter === f;

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
      onPress={() => router.push(`/bail/${l.agreementId}`)}
    />
  );

  return (
    <Screen
      title="Loyers"
      right={
        <Pressable
          onPress={() => setPicker(true)}
          accessibilityRole="button"
          accessibilityLabel="Choisir le mois"
          style={{ height: 40, paddingHorizontal: 14, borderRadius: 999, backgroundColor: color.surfaceRaised, flexDirection: "row", alignItems: "center", gap: 6 }}
        >
          <Text variant="rowSubtitle" style={{ fontFamily: fontFamily.bold }}>
            {capitalize(monthName(month))}
            {month.slice(0, 4) !== currentMonth().slice(0, 4) ? ` ${month.slice(0, 4)}` : ""}
          </Text>
          <ChevronDown size={16} strokeWidth={1.8} color={color.inkMuted} />
        </Pressable>
      }
    >
      {s.lines.length === 0 ? (
        <EmptyState title="Aucun loyer ce mois-ci" body="Les loyers apparaissent ici dès qu'un bail est créé. Ajoutez un locataire depuis la fiche d'un bien." />
      ) : (
        <>
          <View style={{ marginTop: 22, flexDirection: "row", gap: 4, height: 10 }} accessibilityLabel="Progression des loyers du mois">
            {s.received.amount > 0 && <View style={{ flex: s.received.amount / total, backgroundColor: color.mint, borderTopLeftRadius: 999, borderBottomLeftRadius: 999 }} />}
            {s.lateAmount.amount > 0 && <View style={{ flex: s.lateAmount.amount / total, backgroundColor: color.dotLate }} />}
            {s.upcomingAmount.amount > 0 && <View style={{ flex: s.upcomingAmount.amount / total, backgroundColor: color.track, borderTopRightRadius: 999, borderBottomRightRadius: 999 }} />}
          </View>
          <Text variant="rowSubtitle" tone="inkMuted" style={{ marginTop: 10 }}>
            {formatAmount(s.received)} reçus sur {formatAmount(s.expected)} {currencyLabel(currency)} attendus
          </Text>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 18, marginHorizontal: -24 }} contentContainerStyle={{ gap: 8, paddingHorizontal: 24 }}>
            <Chip active={filter === "all"} label="Tous" onPress={() => setFilter("all")} />
            <Chip active={filter === "late"} label={`En retard ${s.late.length}`} onPress={() => setFilter("late")} />
            <Chip active={filter === "paid"} label={`Reçus ${s.paid.length}`} onPress={() => setFilter("paid")} />
            <Chip active={filter === "upcoming"} label={`À venir ${s.upcoming.length}`} onPress={() => setFilter("upcoming")} />
          </ScrollView>

          {show("late") && s.late.length > 0 && (
            <>
              <SectionTitle>En retard</SectionTitle>
              {s.late.map((l, i) =>
                row(l, i, <Status tone={l.status === "UNPAID" ? "danger" : "late"} label={l.status === "PARTIAL" ? "Paiement partiel" : `${l.daysLate} jour${l.daysLate > 1 ? "s" : ""} de retard`} />),
              )}
            </>
          )}

          {show("paid") && s.paid.length > 0 && (
            <>
              <SectionTitle>Reçus</SectionTitle>
              {paidShown.map((l, i) => row(l, i, <Status tone="paid" label="Reçu" />))}
              {s.paid.length > paidShown.length && (
                <Pressable onPress={() => setShowAllPaid(true)} style={{ paddingVertical: 12 }}>
                  <Text variant="rowTitle" tone="sky">
                    Voir les {s.paid.length - paidShown.length} autres
                  </Text>
                </Pressable>
              )}
            </>
          )}

          {show("upcoming") && s.upcoming.length > 0 && (
            <>
              <SectionTitle>À venir</SectionTitle>
              {s.upcoming.map((l, i) => row(l, i, <Status tone="neutral" label={`Le ${dayMonth(l.dueDate)}`} />))}
            </>
          )}
        </>
      )}

      <Sheet visible={picker} onClose={() => setPicker(false)} title="Mois">
        <ScrollView style={{ maxHeight: 380 }}>
          {months.map((m) => (
            <SheetAction
              key={m}
              label={`${capitalize(monthName(m))} ${m.slice(0, 4)}${m === month ? "  ·  affiché" : ""}`}
              onPress={() => {
                setMonth(m);
                setShowAllPaid(false);
                setPicker(false);
              }}
            />
          ))}
        </ScrollView>
      </Sheet>
    </Screen>
  );
}
