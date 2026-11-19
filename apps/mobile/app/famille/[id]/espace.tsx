import { useMemo } from "react";
import { View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { formatShare, kindLabel } from "@keyo/shared";
import { color, radius } from "@keyo/tokens";
import { currentMonth, monthName, today } from "@/data/period";
import { familyHolders, memberDigest } from "@/data/selectors";
import { useUser } from "@/data/session";
import { useOwnerState } from "@/data/store";
import { Amount, AmountList, SectionTitle, Status, SubScreen, Text } from "@/ui";

/**
 * Espace d'un proche, tel qu'il le verra sur son téléphone : ses biens, sa part, l'occupation,
 * l'encaissement du mois, les incidents et le contrôle de gestion. Lecture seule, sans nom ni
 * numéro d'occupant (données personnelles).
 */
export default function MemberSpace() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const user = useUser();
  const state = useOwnerState((s) => s);
  const owner = { id: user.id, name: `${user.firstName} ${user.lastName ?? ""}`.trim() };
  const holder = useMemo(() => familyHolders(state, owner).find((h) => h.id === id), [state, id, owner.id, owner.name]);
  const month = currentMonth();
  const digest = useMemo(() => (holder ? memberDigest(state, holder.id, month, today()) : []), [state, holder, month]);

  if (!holder) {
    return (
      <SubScreen title="Espace introuvable">
        <Text variant="body" tone="inkMuted">
          Cette personne ne fait plus partie de la famille.
        </Text>
      </SubScreen>
    );
  }
  const first = holder.name.split(" ")[0];

  return (
    <SubScreen title={`Bonjour ${first}`} subtitle="Aperçu de son espace Keyo">
      <View style={{ marginTop: 16, padding: 14, borderRadius: radius.md, backgroundColor: color.surfaceSoft }}>
        <Text variant="rowSubtitle" tone="inkMuted">
          Voici ce que {holder.status === "OWNER" ? "verrait un proche" : first} voit, en {holder.access === "MANAGE" ? "co-gestion" : "consultation seule"}. Les noms et numéros des occupants ne sont pas affichés.
        </Text>
      </View>

      <View style={{ marginTop: 16, padding: 22, borderRadius: radius.card, backgroundColor: color.night, gap: 6 }}>
        <Text variant="rowSubtitle" tone="track">
          Valeur de votre part
        </Text>
        {holder.patrimony.totals.length ? (
          holder.patrimony.totals.map((m) => <Amount key={m.currency} value={m} variant="display" tone="onNight" currencyTone="track" />)
        ) : (
          <Text variant="title" tone="onNight">
            Non estimée
          </Text>
        )}
        <Text variant="rowSubtitle" tone="track" style={{ marginTop: 4 }}>
          {`${digest.length} bien${digest.length > 1 ? "s" : ""} géré${digest.length > 1 ? "s" : ""} par ${user.firstName} avec Keyo.`}
        </Text>
      </View>

      <SectionTitle>{`Vos biens en ${monthName(month)}`}</SectionTitle>
      {digest.length === 0 && (
        <Text variant="rowSubtitle" tone="inkMuted">
          Aucune part attribuée pour l'instant.
        </Text>
      )}
      {digest.map((d) => (
        <View key={d.asset.id} style={{ marginTop: 12, padding: 18, borderRadius: radius.card, backgroundColor: color.surfaceRaised, gap: 12 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Text variant="rowTitle">{d.asset.name}</Text>
              <Text variant="rowSubtitle" tone="inkMuted">
                {kindLabel(d.asset.type, d.asset.details.kind)} · votre part {formatShare(d.sharePermille)}
              </Text>
            </View>
            <AmountList values={d.part ? [d.part] : []} />
          </View>
          <Line label="Occupation" value={d.units === 0 ? "–" : `${d.occupied} sur ${d.units}`} />
          <Line
            label="Encaissé ce mois"
            value={d.expected.amount === 0 ? <Text variant="rowTitle">Rien d'attendu</Text> : <Amount value={d.received} variant="rowTitle" />}
          />
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 14 }}>
            {d.late > 0 ? <Status tone="late" label={`${d.late} retard${d.late > 1 ? "s" : ""}`} /> : <Status tone="paid" label="Paiements à jour" />}
            {d.incidents > 0 ? <Status tone="danger" label={`${d.incidents} incident${d.incidents > 1 ? "s" : ""}`} /> : <Status tone="paid" label="Aucun incident" />}
            {d.findings > 0 ? <Status tone="late" label={`${d.findings} point${d.findings > 1 ? "s" : ""} à régler`} /> : <Status tone="paid" label="Dossier en ordre" />}
          </View>
        </View>
      ))}

      <Text variant="caption" tone="inkMuted" style={{ marginTop: 20 }}>
        Valeurs indicatives (valeur estimée ou prix d'achat). Les parts sont celles déclarées par {user.firstName}.
      </Text>
    </SubScreen>
  );
}

function Line({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
      <Text variant="rowSubtitle" tone="inkMuted">
        {label}
      </Text>
      {typeof value === "string" ? <Text variant="rowTitle">{value}</Text> : value}
    </View>
  );
}
