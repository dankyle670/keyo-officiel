import { useState } from "react";
import { Alert, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { color, radius } from "@keyo/tokens";
import { useOwnerState } from "@/data/store";
import { AccountRow } from "@/payments/AccountRow";
import { paymentApi, PaymentApiError, type Challenge, type Change } from "@/payments/api";
import { CodeSheet } from "@/payments/CodeSheet";
import { ActionRow, Button, InfoRow, SettingsGroup, SubScreen, Text, ToggleRow } from "@/ui";

const fr = (iso?: string) => (iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }) : "");

/** Fiche d'un compte : vérification, biens et compte par défaut, suppression ; chaque changement par code SMS. */
export default function AccountDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const a = useOwnerState((s) => s.paymentAccounts?.find((x) => x.id === id));
  const assets = useOwnerState((s) => s.assets);
  const [assetIds, setAssetIds] = useState<string[] | undefined>(undefined);
  const [isDefault, setIsDefault] = useState<boolean | undefined>(undefined);
  const [challenge, setChallenge] = useState<{ c: Challenge; op: Change["op"] }>();
  const [error, setError] = useState<string>();

  if (!a)
    return (
      <SubScreen title="Compte">
        <Text variant="body" tone="inkMuted" style={{ marginTop: 20 }}>
          Ce compte n'existe plus.
        </Text>
      </SubScreen>
    );

  const ids = assetIds ?? a.assetIds;
  const def = isDefault ?? a.isDefault;
  const changed = a.purpose === "RECEIVE" && (def !== a.isDefault || ids.length !== a.assetIds.length || ids.some((x) => !a.assetIds.includes(x)));

  const ask = async (change: Change) => {
    setError(undefined);
    try {
      setChallenge({ c: await paymentApi.requestChange(a.id, change), op: change.op });
    } catch (e) {
      setError(e instanceof PaymentApiError ? e.message : "Demande impossible.");
    }
  };
  const remove = () =>
    Alert.alert("Supprimer ce compte ?", `${a.label} ${a.masked}. Un code vous sera envoyé pour confirmer.`, [
      { text: "Annuler", style: "cancel" },
      { text: "Supprimer", style: "destructive", onPress: () => ask({ op: "DELETE" }) },
    ]);

  const pending = a.status === "PENDING";
  return (
    <SubScreen
      title={a.kind === "CARD" ? "Carte de l'abonnement" : a.purpose === "SUBSCRIPTION" ? "Paiement de l'abonnement" : "Compte de réception"}
      footer={
        pending ? (
          <Button label="Vérifier ce compte" onPress={() => ask({ op: "VERIFY" })} />
        ) : changed ? (
          <Button label="Enregistrer les changements" onPress={() => ask({ op: "UPDATE", patch: { assetIds: ids, isDefault: def } })} />
        ) : undefined
      }
    >
      <SettingsGroup>
        <AccountRow account={a} detail={a.holder} onPress={() => undefined} />
      </SettingsGroup>

      {a.warning && (
        <View style={{ marginTop: 16, padding: 16, borderRadius: radius.card, backgroundColor: color.amberTint }}>
          <Text variant="rowSubtitle">{a.warning}</Text>
        </View>
      )}

      <SettingsGroup>
        <InfoRow title="Titulaire" value={a.holder} />
        {a.expiry ? <InfoRow title="Expiration" value={a.expiry} /> : null}
        <InfoRow title="Ajouté le" value={fr(a.createdAt)} />
        {a.verifiedAt ? <InfoRow title="Vérifié le" value={fr(a.verifiedAt)} /> : null}
      </SettingsGroup>

      {a.purpose === "RECEIVE" && !pending && (
        <>
          <SettingsGroup footer="Les biens sans compte attribué utilisent le compte par défaut.">
            <ToggleRow title="Compte par défaut" value={def} onChange={setIsDefault} />
          </SettingsGroup>
          {assets.length > 0 && (
            <SettingsGroup title="Réservé à ces biens">
              {assets.map((x) => (
                <ToggleRow key={x.id} title={x.name} value={ids.includes(x.id)} onChange={(v) => setAssetIds(v ? [...ids, x.id] : ids.filter((y) => y !== x.id))} />
              ))}
            </SettingsGroup>
          )}
        </>
      )}

      {error && (
        <Text variant="rowSubtitle" tone="danger" style={{ marginTop: 16 }}>
          {error}
        </Text>
      )}

      <SettingsGroup footer={a.kind === "CARD" ? "Pour changer de carte, ajoutez-en une nouvelle depuis Mon abonnement." : "Pour changer de numéro ou d'IBAN, ajoutez un nouveau compte puis supprimez celui-ci."}>
        <ActionRow title="Supprimer ce compte" destructive onPress={remove} />
      </SettingsGroup>

      <CodeSheet
        challenge={challenge?.c}
        title={challenge?.op === "DELETE" ? "Confirmer la suppression" : challenge?.op === "VERIFY" ? "Vérifier le compte" : "Confirmer les changements"}
        onClose={() => setChallenge(undefined)}
        onDone={() => {
          const op = challenge?.op;
          setChallenge(undefined);
          setAssetIds(undefined);
          setIsDefault(undefined);
          if (op === "DELETE") router.back();
        }}
      />
    </SubScreen>
  );
}
