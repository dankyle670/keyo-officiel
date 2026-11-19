import { useMemo, useState } from "react";
import { Alert, Image, ScrollView, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChevronLeft, DoorOpen, Ellipsis, FileText, MessageCircle, TrendingUp, UserPlus } from "lucide-react-native";
import { cap, formatAmount, money, profileOf } from "@keyo/shared";
import { color, radius } from "@keyo/tokens";
import { eventIcon } from "@/data/icons";
import { buildMarkers } from "@/data/markers";
import { currentMonth, monthYear, today } from "@/data/period";
import { assetSummary, formatPermille, initialsOf, isOpenEvent, partyName, rentLines, yearFinance } from "@/data/selectors";
import { actions, useOwnerState } from "@/data/store";
import { AssetsMap } from "@/map/AssetsMap";
import { Amount, Button, IconCircle, ListRow, RoundButton, SectionTitle, Sheet, SheetAction, Status, Text } from "@/ui";

const STATUS_LABEL = { PAID: "À jour", UPCOMING: "À jour", LATE: "En retard", PARTIAL: "Partiel", UNPAID: "Impayé" } as const;
const STATUS_TONE = { PAID: "paid", UPCOMING: "paid", LATE: "late", PARTIAL: "late", UNPAID: "danger" } as const;

/** Détail d'un bien (03-ProBien) : vue 3D, chiffres clés, logements et locataires, incidents, documents, finances. */
export default function AssetDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const state = useOwnerState((s) => s);
  const asset = state.assets.find((a) => a.id === id);
  const [menu, setMenu] = useState(false);
  /** Unité libre sélectionnée : inviter un vrai occupant ou en créer un fictif. */
  const [vacant, setVacant] = useState<string | null>(null);

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
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 16 }}>
        <Text variant="body">Ce bien est introuvable.</Text>
        <Button kind="soft" label="Retour" onPress={() => router.back()} />
      </View>
    );
  }

  const { summary, lines, finance, year, incidents, docs } = data;
  const profile = profileOf(asset.type);
  const mkey = profile.measure?.key;
  const measure = summary.units.reduce((n, u) => n + (mkey && typeof u.details[mkey] === "number" ? (u.details[mkey] as number) : 0), 0);
  const unitWord = (n: number) => (n > 1 ? profile.unit.many : profile.unit.one);
  const photos = docs.filter((d) => d.kind === "PHOTO" && d.url);
  const receipts = docs.filter((d) => d.kind === "RECEIPT").length;
  const docLabels = [
    docs.some((d) => d.kind === "LEASE") && "bail",
    docs.some((d) => d.kind === "TITLE_DEED") && "titre foncier",
    receipts > 0 && `${receipts} quittance${receipts > 1 ? "s" : ""}`,
    photos.length > 0 && `${photos.length} photo${photos.length > 1 ? "s" : ""}`,
  ].filter(Boolean) as string[];
  const single = summary.leases.length === 1 ? summary.leases[0] : undefined;
  const singleName = single ? partyName(state, single.partyId) : null;

  const confirmDelete = () => {
    setMenu(false);
    Alert.alert("Supprimer ce bien ?", `${asset.name}, ses logements, baux, documents et historique seront supprimés de ce téléphone.`, [
      { text: "Annuler", style: "cancel" },
      {
        text: "Supprimer",
        style: "destructive",
        onPress: () => {
          router.back();
          actions.deleteAsset(asset.id);
        },
      },
    ]);
  };

  return (
    <View style={{ flex: 1, backgroundColor: color.surface }}>
      <View style={{ height: 300 }}>
        {photos[0] ? (
          <Image source={{ uri: photos[0].url }} style={{ flex: 1 }} accessibilityLabel={`Photo de ${asset.name}`} />
        ) : (
          <AssetsMap markers={data.markers} focus={{ lat: asset.location.lat, lng: asset.location.lng }} />
        )}
        <View style={{ position: "absolute", top: insets.top + 6, left: 16, right: 16, flexDirection: "row", justifyContent: "space-between" }}>
          <RoundButton icon={ChevronLeft} label="Retour" onPress={() => router.back()} />
          <RoundButton icon={Ellipsis} label="Plus d'actions" onPress={() => setMenu(true)} />
        </View>
      </View>

      <ScrollView
        style={{ marginTop: -30, backgroundColor: color.surface, borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet }}
        contentContainerStyle={{ padding: 24, paddingBottom: insets.bottom + (single ? 110 : 32) }}
      >
        <Text variant="display" accessibilityRole="header">
          {asset.name}
        </Text>
        <Text variant="body" tone="inkMuted" style={{ marginTop: 4 }}>
          {asset.location.address}, {asset.location.city}. {summary.units.length} {unitWord(summary.units.length)}
          {measure && profile.measure ? `, ${String(measure).replace(".", ",")} ${profile.measure.suffix.replace("(s)", measure > 1 ? "s" : "")}` : ""}.
        </Text>

        <View style={{ flexDirection: "row", marginTop: 26, marginBottom: 6 }}>
          <Figure label={cap(profile.amount)} value={formatAmount(summary.monthlyRent)} />
          <Figure label="Rentabilité" value={summary.grossYieldPermille !== undefined ? formatPermille(summary.grossYieldPermille) : "–"} />
          <Figure label="Occupé" value={summary.units.length === 0 ? "–" : summary.vacantUnits.length === 0 ? "oui" : summary.leases.length === 0 ? "non" : `${summary.leases.length} sur ${summary.units.length}`} />
        </View>

        <SectionTitle>{summary.units.length > 1 ? cap(profile.unit.many) : cap(profile.occupant.one)}</SectionTitle>
        {summary.units.map((u, i) => {
          const lease = summary.leases.find((g) => g.unitId === u.id);
          if (!lease) {
            const asking = typeof u.details.askingRent === "number" ? u.details.askingRent : 0;
            return (
              <ListRow
                key={u.id}
                divider={i > 0}
                leading={<IconCircle icon={DoorOpen} bg="surfaceSoft" fg="inkMuted" />}
                title={summary.units.length > 1 ? u.label : `${cap(profile.unit.one)} libre`}
                subtitle={asking ? `Libre, ${profile.amount} proposé ${formatAmount(money(asking, asset.currency))}` : "Libre"}
                trailing={<Status tone="info" label="Pourvoir" />}
                onPress={() => setVacant(u.id)}
              />
            );
          }
          const name = partyName(state, lease.partyId);
          const line = lines.find((l) => l.agreementId === lease.id);
          const future = lease.startDate > today();
          return (
            <ListRow
              key={u.id}
              divider={i > 0}
              leading={<IconCircle initials={initialsOf(name)} bg="mintTint" fg="mintDeep" />}
              title={name}
              subtitle={`${summary.units.length > 1 ? `${u.label}, ` : ""}${future ? "arrive en" : `${profile.occupant.one} depuis`} ${monthYear(lease.startDate)}`}
              trailing={
                future ? (
                  <Status tone="info" label="À venir" />
                ) : line ? (
                  <Status tone={STATUS_TONE[line.status]} label={line.status === "LATE" ? `${line.daysLate} j de retard` : STATUS_LABEL[line.status]} />
                ) : (
                  <Status tone="paid" label="À jour" />
                )
              }
              onPress={() => router.push(`/bail/${lease.id}`)}
            />
          );
        })}

        {incidents.length > 0 && <SectionTitle>Incidents</SectionTitle>}
        {incidents.map((e, i) => (
          <ListRow
            key={e.id}
            divider={i > 0}
            leading={<IconCircle icon={eventIcon(e.category)} bg="dangerTint" fg="danger" />}
            title={e.title}
            subtitle={e.status === "QUOTES_PENDING" ? "Devis à valider" : e.status === "SCHEDULED" ? "Intervention programmée" : "Nouveau"}
            chevron
            onPress={() => router.push(`/incident/${e.id}`)}
          />
        ))}

        <SectionTitle>Gestion</SectionTitle>
        <ListRow
          divider={false}
          leading={<IconCircle icon={FileText} />}
          title="Documents"
          subtitle={docLabels.length ? capitalizeList(docLabels) : "Ajoutez le titre foncier, l'ACD ou les factures"}
          chevron
          onPress={() => router.push({ pathname: "/bien/[id]/documents", params: { id: asset.id } })}
        />
        <ListRow
          leading={<IconCircle icon={TrendingUp} />}
          title={`Finances ${year}`}
          subtitle={`${formatAmount(finance.income)} reçus, ${formatAmount(finance.expenses)} de dépenses`}
          trailing={<Amount value={finance.net} variant="rowTitle" />}
          onPress={() => router.push({ pathname: "/bien/[id]/finances", params: { id: asset.id } })}
        />
      </ScrollView>

      {single && singleName && (
        <View style={{ position: "absolute", left: 24, right: 24, bottom: insets.bottom + 16 }}>
          <Button kind="secondary" icon={MessageCircle} label={`Écrire à ${singleName.split(" ")[0]}`} onPress={() => router.push(`/messages/${single.partyId}`)} />
        </View>
      )}

      <Sheet visible={!!vacant} onClose={() => setVacant(null)} title={summary.units.find((u) => u.id === vacant)?.label ?? cap(profile.unit.one)}>
        <SheetAction
          label={`Inviter un ${profile.occupant.one}`}
          onPress={() => {
            const unit = vacant;
            setVacant(null);
            if (unit) router.push({ pathname: "/bien/[id]/inviter", params: { id: asset.id, unit } });
          }}
        />
        <SheetAction
          label={`Créer un ${profile.occupant.one} fictif`}
          onPress={() => {
            const unit = vacant;
            setVacant(null);
            if (unit) actions.addFakeOccupant(unit);
          }}
        />
      </Sheet>

      <Sheet visible={menu} onClose={() => setMenu(false)} title={asset.name}>
        <SheetAction
          label="Modifier le bien"
          onPress={() => {
            setMenu(false);
            router.push({ pathname: "/bien/[id]/modifier", params: { id: asset.id } });
          }}
        />
        {summary.vacantUnits[0] && (
          <SheetAction
            label={`Inviter un ${profile.occupant.one}`}
            onPress={() => {
              setMenu(false);
              router.push({ pathname: "/bien/[id]/inviter", params: { id: asset.id, unit: summary.vacantUnits[0]!.id } });
            }}
          />
        )}
        <SheetAction
          label={`Ajouter ${profile.unit.feminine ? "une" : "un"} ${profile.unit.one}`}
          onPress={() => {
            setMenu(false);
            const last = summary.units[summary.units.length - 1];
            const rent = last && typeof last.details.askingRent === "number" ? last.details.askingRent : 0;
            actions.addUnit(asset.id, `${cap(profile.unit.one)} ${summary.units.length + 1}`, { askingRent: rent });
          }}
        />
        <SheetAction
          label="Ajouter une dépense"
          onPress={() => {
            setMenu(false);
            router.push({ pathname: "/bien/[id]/depense", params: { id: asset.id } });
          }}
        />
        <SheetAction
          label="Ajouter un document"
          onPress={() => {
            setMenu(false);
            router.push({ pathname: "/bien/[id]/documents", params: { id: asset.id } });
          }}
        />
        <SheetAction label="Supprimer le bien" destructive onPress={confirmDelete} />
      </Sheet>
    </View>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1 }}>
      <Text variant="rowSubtitle" tone="inkMuted">
        {label}
      </Text>
      <Text variant="title" tabular numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={{ fontFamily: "PlusJakartaSans_800ExtraBold" }}>
        {value}
      </Text>
    </View>
  );
}

const capitalizeList = (items: string[]) => {
  const s = items.length > 1 ? `${items.slice(0, -1).join(", ")} et ${items[items.length - 1]}` : items[0] ?? "";
  return s.charAt(0).toUpperCase() + s.slice(1);
};
