import { useMemo } from "react";
import { ScrollView, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChevronLeft, Ellipsis, FileText, MessageCircle, TrendingUp } from "lucide-react-native";
import { formatAmount } from "@keyo/shared";
import { color, radius } from "@keyo/tokens";
import { eventIcon } from "@/data/icons";
import { buildMarkers } from "@/data/markers";
import { currentMonth, monthYear, today } from "@/data/period";
import { assetSummary, formatPermille, initialsOf, isOpenEvent, partyName, rentLines, yearFinance } from "@/data/selectors";
import { useOwnerState } from "@/data/store";
import { AssetsMap } from "@/map/AssetsMap";
import { Button, IconCircle, ListRow, RoundButton, Status, Text } from "@/ui";

const STATUS_LABEL = { PAID: "À jour", UPCOMING: "À venir", LATE: "En retard", PARTIAL: "Partiel", UNPAID: "Impayé" } as const;
const STATUS_TONE = { PAID: "paid", UPCOMING: "neutral", LATE: "late", PARTIAL: "late", UNPAID: "danger" } as const;

/** Détail d'un bien (03-ProBien) : vue 3D, loyer, rentabilité, locataire, incidents, documents, finances. */
export default function AssetDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const state = useOwnerState((s) => s);
  const asset = state.assets.find((a) => a.id === id);

  const data = useMemo(() => {
    if (!asset) return null;
    const year = Number(today().slice(0, 4));
    const summary = assetSummary(state, asset);
    const lines = rentLines(state, currentMonth(), today()).filter((l) => l.assetId === asset.id);
    return {
      summary,
      lines,
      finance: yearFinance(state, asset.id, year, asset.currency),
      year,
      incidents: state.events.filter((e) => e.assetId === asset.id && isOpenEvent(e)),
      docs: state.documents.filter((d) => d.assetId === asset.id),
      markers: buildMarkers(state, [asset], currentMonth(), today()).map((m) => ({ ...m, label: undefined, pin: null, x: 0.5, y: 0.55 })),
    };
  }, [state, asset]);

  if (!asset || !data) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
        <Text variant="body">Ce bien est introuvable.</Text>
      </View>
    );
  }

  const { summary, lines, finance, year, incidents, docs } = data;
  const rooms = summary.units.reduce((n, u) => n + (typeof u.details.rooms === "number" ? u.details.rooms : 0), 0);
  const firstLease = summary.leases[0];
  const singleOccupant = summary.leases.length === 1 && firstLease ? partyName(state, firstLease.partyId) : null;
  const receipts = docs.filter((d) => d.kind === "RECEIPT").length;
  const docLabels = [
    docs.some((d) => d.kind === "LEASE") && "Bail",
    docs.some((d) => d.kind === "TITLE_DEED") && "titre foncier",
    receipts > 0 && `${receipts} quittance${receipts > 1 ? "s" : ""}`,
  ].filter(Boolean) as string[];

  return (
    <View style={{ flex: 1, backgroundColor: color.surface }}>
      <View style={{ height: 300 }}>
        <AssetsMap markers={data.markers} focus={{ lat: asset.location.lat, lng: asset.location.lng }} />
        <View style={{ position: "absolute", top: insets.top + 6, left: 16, right: 16, flexDirection: "row", justifyContent: "space-between" }}>
          <RoundButton icon={ChevronLeft} label="Retour" onPress={() => router.back()} />
          <RoundButton icon={Ellipsis} label="Plus d'actions" />
        </View>
      </View>

      <ScrollView
        style={{ marginTop: -30, backgroundColor: color.surface, borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet }}
        contentContainerStyle={{ padding: 24, paddingBottom: insets.bottom + 110 }}
      >
        <Text variant="display" accessibilityRole="header">
          {asset.name}
        </Text>
        <Text variant="body" tone="inkMuted" style={{ marginTop: 4 }}>
          {asset.location.address}. {summary.units.length === 1 ? `1 logement${rooms ? ` de ${rooms} pièces` : ""}` : `${summary.units.length} logements`}.
        </Text>

        <View style={{ flexDirection: "row", marginTop: 26, marginBottom: 18 }}>
          <Figure label="Loyer" value={formatAmount(summary.monthlyRent)} />
          <Figure label="Rentabilité" value={summary.grossYieldPermille !== undefined ? formatPermille(summary.grossYieldPermille) : "–"} />
          <Figure label="Occupé" value={summary.occupied ? (summary.leases.length === summary.units.length ? "oui" : `${summary.leases.length} sur ${summary.units.length}`) : "non"} />
        </View>

        {lines.map((l, i) => (
          <ListRow
            key={l.scheduleItemId}
            divider={i > 0}
            leading={<IconCircle initials={initialsOf(l.partyName)} bg="mintTint" fg="mintDeep" />}
            title={l.partyName}
            subtitle={`Locataire depuis ${monthYear(l.agreementStart)}`}
            trailing={<Status tone={STATUS_TONE[l.status]} label={l.status === "LATE" ? `${l.daysLate} j de retard` : STATUS_LABEL[l.status]} />}
          />
        ))}

        {incidents.map((e) => (
          <ListRow
            key={e.id}
            leading={<IconCircle icon={eventIcon(e.category)} bg="dangerTint" fg="danger" />}
            title={e.title}
            subtitle={e.status === "QUOTES_PENDING" ? "Devis à valider" : e.status === "SCHEDULED" ? "Intervention programmée" : "Nouveau"}
            chevron
            onPress={() => router.push(`/incident/${e.id}`)}
          />
        ))}

        <ListRow leading={<IconCircle icon={FileText} />} title="Documents" subtitle={docLabels.length ? joinFr(docLabels) : "Aucun document"} chevron onPress={() => {}} />
        <ListRow
          leading={<IconCircle icon={TrendingUp} />}
          title={`Finances ${year}`}
          subtitle={`${formatAmount(finance.income)} reçus, ${formatAmount(finance.expenses)} de dépenses`}
          chevron
          onPress={() => {}}
        />
      </ScrollView>

      {singleOccupant && (
        <View style={{ position: "absolute", left: 24, right: 24, bottom: insets.bottom + 16 }}>
          <Button kind="secondary" icon={MessageCircle} label={`Écrire à ${singleOccupant.split(" ")[0]}`} onPress={() => {}} />
        </View>
      )}
    </View>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1 }}>
      <Text variant="rowSubtitle" tone="inkMuted">
        {label}
      </Text>
      <Text variant="title" tabular style={{ fontFamily: "PlusJakartaSans_800ExtraBold" }}>
        {value}
      </Text>
    </View>
  );
}

const joinFr = (items: string[]) => {
  const [first, ...rest] = items;
  const s = rest.length ? `${items.slice(0, -1).join(", ")} et ${items[items.length - 1]}` : first ?? "";
  return s.charAt(0).toUpperCase() + s.slice(1);
};
