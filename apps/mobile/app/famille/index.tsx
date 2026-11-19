import { useMemo } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { Users } from "lucide-react-native";
import { formatShare } from "@keyo/shared";
import { color, radius } from "@keyo/tokens";
import { askAgent } from "@/agent/navigation";
import { assetHolders, familyAssets, familyHolders, initialsOf, portfolioValue } from "@/data/selectors";
import { useUser } from "@/data/session";
import { useOwnerState } from "@/data/store";
import { Amount, AmountList as Totals, Button, IconCircle, ListRow, SectionTitle, Status, SubScreen, Text } from "@/ui";

/** Famille et patrimoine : valeur des biens, part de chacun, proches invités à suivre la gestion. */
export default function Family() {
  const user = useUser();
  const state = useOwnerState((s) => s);
  const owner = { id: user.id, name: `${user.firstName} ${user.lastName ?? ""}`.trim() };
  const holders = useMemo(() => familyHolders(state, owner), [state, owner.id, owner.name]);
  const total = useMemo(() => portfolioValue(state), [state]);
  const shared = familyAssets(state);
  const unvalued = state.assets.filter((a) => !a.value && typeof a.details.purchasePrice !== "number").length;

  return (
    <SubScreen title="Famille et patrimoine" footer={<Button label="Inviter un proche" onPress={() => router.push("/famille/inviter")} />}>
      <View style={{ marginTop: 20, padding: 22, borderRadius: radius.card, backgroundColor: color.night, gap: 6 }}>
        <Text variant="rowSubtitle" tone="track">
          Valeur totale des biens
        </Text>
        {total.length ? total.map((m) => <Amount key={m.currency} value={m} variant="display" tone="onNight" currencyTone="track" />) : <Text variant="title" tone="onNight">Non estimée</Text>}
        <Text variant="rowSubtitle" tone="track" style={{ marginTop: 6 }}>
          {state.assets.length} bien{state.assets.length > 1 ? "s" : ""}, dont {shared.length} de famille. Valeur estimée, ou prix d'achat à défaut.
        </Text>
      </View>
      <View style={{ marginTop: 12 }}>
        <Button kind="soft" label="Évaluer tous les biens avec l'agent" onPress={() => askAgent("Évalue l'ensemble de mes biens, globalement et par unité, à partir de leurs données et de leurs documents. Propose-moi les valeurs à retenir et dis-moi ce qui manque pour être plus précis.")} />
      </View>
      {unvalued > 0 && (
        <Text variant="caption" tone="inkMuted" style={{ marginTop: 10 }}>
          {unvalued} bien{unvalued > 1 ? "s" : ""} sans valeur : renseignez-la dans « Modifier le bien ».
        </Text>
      )}

      <SectionTitle>Part de chacun</SectionTitle>
      {holders.map((h, i) => (
        <ListRow
          key={h.id}
          divider={i > 0}
          leading={<IconCircle initials={initialsOf(h.name)} bg={h.status === "OWNER" ? "mintTint" : "surfaceSoft"} fg={h.status === "OWNER" ? "mintDeep" : "ink"} />}
          title={h.name}
          subtitle={`${h.relation} · ${h.patrimony.lines.length} bien${h.patrimony.lines.length > 1 ? "s" : ""}`}
          trailing={
            <>
              <Totals values={h.patrimony.totals} />
              {h.status === "OWNER" ? <Status tone="paid" label="Propriétaire" /> : h.status === "JOINED" ? <Status tone="paid" label="Actif" /> : <Status tone="neutral" label="Invité" />}
            </>
          }
          onPress={() => router.push({ pathname: "/famille/[id]", params: { id: h.id } })}
        />
      ))}

      <SectionTitle>Biens de famille</SectionTitle>
      {shared.length === 0 && (
        <Text variant="rowSubtitle" tone="inkMuted">
          Aucun bien n'est encore déclaré comme bien de famille. Ouvrez un bien, puis « Modifier le bien » et choisissez « Famille » pour répartir les parts.
        </Text>
      )}
      {shared.map((a, i) => {
        const hs = assetHolders(state, a.id, owner);
        return (
          <ListRow
            key={a.id}
            divider={i > 0}
            leading={<IconCircle icon={Users} />}
            title={a.name}
            subtitle={hs.map((h) => `${h.name.split(" ")[0]} ${formatShare(h.sharePermille)}`).join(", ")}
            chevron
            onPress={() => router.push(`/bien/${a.id}`)}
          />
        );
      })}

      <Text variant="caption" tone="inkMuted" style={{ marginTop: 20 }}>
        Les valeurs sont indicatives. Pour un partage ou une succession, faites établir les parts par un notaire.
      </Text>
    </SubScreen>
  );
}
