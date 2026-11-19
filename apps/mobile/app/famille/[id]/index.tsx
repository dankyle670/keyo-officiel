import { useMemo } from "react";
import { Alert, Linking, Share, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Eye, MessagesSquare, Phone } from "lucide-react-native";
import { formatShare } from "@keyo/shared";
import { color, radius } from "@keyo/tokens";
import { fullDate } from "@/data/period";
import { familyHolders } from "@/data/selectors";
import { useUser } from "@/data/session";
import { actions, useOwnerState } from "@/data/store";
import { Amount, AmountList as Totals, Button, IconCircle, ListRow, SectionTitle, Segmented, Status, SubScreen, Text } from "@/ui";

/** Fiche d'un détenteur : sa part de chaque bien, sa valeur, ses droits et l'état de son invitation. */
export default function FamilyMember() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const user = useUser();
  const state = useOwnerState((s) => s);
  const owner = { id: user.id, name: `${user.firstName} ${user.lastName ?? ""}`.trim() };
  const holder = useMemo(() => familyHolders(state, owner).find((h) => h.id === id), [state, id, owner.id, owner.name]);

  if (!holder) {
    return (
      <SubScreen title="Proche introuvable">
        <Text variant="body" tone="inkMuted">
          Cette personne ne fait plus partie de la famille sur ce téléphone.
        </Text>
      </SubScreen>
    );
  }
  const p = holder.party;
  const first = holder.name.split(" ")[0];

  const remove = () =>
    Alert.alert(`Retirer ${first} ?`, `${first} n'aura plus accès aux biens. Ses parts vous reviennent ; vous pourrez les répartir à nouveau.`, [
      { text: "Annuler", style: "cancel" },
      {
        text: "Retirer",
        style: "destructive",
        onPress: () => {
          router.back();
          actions.removeFamilyMember(holder.id);
        },
      },
    ]);

  return (
    <SubScreen
      title={holder.name}
      subtitle={holder.status === "OWNER" ? "Vous" : holder.relation}
      footer={<Button kind="secondary" icon={Eye} label={holder.status === "OWNER" ? "Voir comme un proche" : `Voir l'espace de ${first}`} onPress={() => router.push({ pathname: "/famille/[id]/espace", params: { id: holder.id } })} />}
    >
      <View style={{ marginTop: 20, padding: 20, borderRadius: radius.card, backgroundColor: color.surfaceRaised, gap: 6 }}>
        <Text variant="rowSubtitle" tone="inkMuted">
          Valeur de {holder.status === "OWNER" ? "votre part" : "sa part"}
        </Text>
        {holder.patrimony.totals.length ? holder.patrimony.totals.map((m) => <Amount key={m.currency} value={m} variant="amount" />) : <Text variant="title">–</Text>}
        {holder.status !== "OWNER" && (
          <View style={{ marginTop: 6 }}>
            {holder.status === "JOINED" ? <Status tone="paid" label={`Actif depuis le ${fullDate(p!.joinedAt!.slice(0, 10))}`} /> : <Status tone="neutral" label={`Invité le ${fullDate(p!.invitedAt?.slice(0, 10) ?? "")}, pas encore inscrit`} />}
          </View>
        )}
      </View>

      <SectionTitle>Biens</SectionTitle>
      {holder.patrimony.lines.length === 0 && (
        <Text variant="rowSubtitle" tone="inkMuted">
          Aucune part attribuée. Ouvrez un bien de famille, puis « Modifier le bien » pour répartir les parts.
        </Text>
      )}
      {holder.patrimony.lines.map((l, i) => {
        const a = state.assets.find((x) => x.id === l.assetId)!;
        return (
          <ListRow
            key={l.assetId}
            divider={i > 0}
            leading={<IconCircle initials={formatShare(l.sharePermille).replace(" %", "").slice(0, 3)} bg="mintTint" fg="mintDeep" />}
            title={a.name}
            subtitle={`${formatShare(l.sharePermille)}${a.holding === "FAMILY" ? " · bien de famille" : " · bien personnel"}`}
            trailing={<Totals values={l.part ? [l.part] : []} />}
            onPress={() => router.push(`/bien/${a.id}`)}
          />
        );
      })}

      {p && (
        <>
          <SectionTitle>Accès</SectionTitle>
          <Segmented
            value={p.access ?? "VIEW"}
            onChange={(v) => actions.updateFamilyMember(p.id, { access: v })}
            options={[
              { value: "VIEW", label: "Consulter" },
              { value: "MANAGE", label: "Co-gérer" },
            ]}
          />
          <ListRow divider={false} leading={<IconCircle icon={Phone} />} title="Appeler" subtitle={p.phone} onPress={() => Linking.openURL(`tel:${p.phone}`)} />
          <ListRow leading={<IconCircle icon={MessagesSquare} />} title="WhatsApp" onPress={() => Linking.openURL(`https://wa.me/${p.phone.replace("+", "")}`)} />
          {holder.status === "INVITED" && (
            <View style={{ marginTop: 16 }}>
              <Button
                kind="soft"
                label="Renvoyer l'invitation"
                onPress={() =>
                  Share.share({ message: `Bonjour ${first}, ${user.firstName} vous invite sur Keyo pour suivre les biens de la famille. Rejoignez-nous : https://keyo.app/f/${p.id}` }).then(() =>
                    actions.updateFamilyMember(p.id, { invitedAt: new Date().toISOString() }),
                  )
                }
              />
            </View>
          )}
          <View style={{ marginTop: 12 }}>
            <Button kind="soft" label={`Retirer ${first} de la famille`} onPress={remove} />
          </View>
        </>
      )}
    </SubScreen>
  );
}
