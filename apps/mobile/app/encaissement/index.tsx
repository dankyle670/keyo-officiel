import { useCallback, useState } from "react";
import { View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Plus } from "lucide-react-native";
import { receivingAccountFor, type PaymentAccountView } from "@keyo/shared";
import { color, radius } from "@keyo/tokens";
import { session, useSettings } from "@/data/session";
import { useOwnerState } from "@/data/store";
import { AccountRow } from "@/payments/AccountRow";
import { paymentApi } from "@/payments/api";
import { Button, SettingsGroup, SubScreen, Text, ToggleRow } from "@/ui";

/**
 * Comptes de réception : où arrivent les loyers payés par les locataires, et moyens de paiement
 * proposés aux locataires. Rien ici ne concerne l'abonnement Keyo (voir Abonnement).
 */
export default function Encaissement() {
  const accounts = useOwnerState((s) => s.paymentAccounts);
  const assets = useOwnerState((s) => s.assets);
  const settings = useSettings();
  const [error, setError] = useState<string>();

  useFocusEffect(
    useCallback(() => {
      paymentApi
        .list()
        .then(() => setError(undefined))
        .catch((e: Error) => setError(e.message));
    }, []),
  );

  const receive = (accounts ?? []).filter((a) => a.purpose === "RECEIVE");
  const verified = receive.some((a) => a.status === "VERIFIED");
  const uncovered = assets.filter((as) => !receivingAccountFor(receive, as.id));
  const detail = (a: PaymentAccountView) => {
    const names = a.assetIds.map((id) => assets.find((x) => x.id === id)?.name).filter(Boolean);
    return [a.holder, a.isDefault ? "par défaut" : undefined, names.length ? names.join(", ") : undefined].filter(Boolean).join(" · ");
  };
  const set = (patch: Partial<typeof settings.paymentMethods>) => session.updateSettings({ paymentMethods: { ...settings.paymentMethods, ...patch } });

  return (
    <SubScreen
      title="Comptes de réception"
      subtitle="Les loyers de vos locataires arrivent directement sur ces comptes. Keyo ne détient jamais vos fonds."
      footer={<Button label="Ajouter un compte" icon={Plus} onPress={() => router.push("/encaissement/ajouter")} />}
    >
      {error && !accounts && (
        <Text variant="rowSubtitle" tone="danger" style={{ marginTop: 20 }}>
          {error}
        </Text>
      )}

      {accounts && !verified && (
        <View style={{ marginTop: 24, padding: 18, borderRadius: radius.card, backgroundColor: color.amberTint, gap: 6 }}>
          <Text variant="rowTitle">Aucun compte de réception vérifié</Text>
          <Text variant="rowSubtitle" tone="inkMuted">
            Tant qu'il manque, vos occupants ne peuvent pas payer en ligne et Keyo n'envoie aucun lien de paiement.
          </Text>
        </View>
      )}

      {receive.length > 0 && (
        <SettingsGroup
          title="Vos comptes"
          footer={verified && uncovered.length ? `Sans compte attribué ni compte par défaut : ${uncovered.map((a) => a.name).join(", ")}.` : "Chaque modification est confirmée par un code envoyé par SMS."}
        >
          {receive.map((a) => (
            <AccountRow key={a.id} account={a} detail={detail(a)} onPress={() => router.push({ pathname: "/encaissement/[id]", params: { id: a.id } })} />
          ))}
        </SettingsGroup>
      )}

      <SettingsGroup title="Vos locataires peuvent payer par" footer="Les paiements passent par notre partenaire de paiement agréé.">
        <ToggleRow title="Mobile Money" subtitle="Wave, Orange Money, MTN, Moov." value={settings.paymentMethods.mobileMoney} onChange={(v) => set({ mobileMoney: v })} />
        <ToggleRow title="Carte bancaire" value={settings.paymentMethods.card} onChange={(v) => set({ card: v })} />
        <ToggleRow title="Virement" value={settings.paymentMethods.bankTransfer} onChange={(v) => set({ bankTransfer: v })} />
      </SettingsGroup>

    </SubScreen>
  );
}
