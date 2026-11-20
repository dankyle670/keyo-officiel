import { useCallback, useState } from "react";
import { View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { CreditCard, Plus } from "lucide-react-native";
import { receivingAccountFor, type PaymentAccountView } from "@keyo/shared";
import { color, radius } from "@keyo/tokens";
import { session, useSettings } from "@/data/session";
import { useOwnerState } from "@/data/store";
import { AccountRow } from "@/payments/AccountRow";
import { paymentApi } from "@/payments/api";
import { Button, NavRow, SettingsGroup, SubScreen, Text, ToggleRow } from "@/ui";

/**
 * Recevoir mes loyers : comptes sur lesquels l'agrégateur reverse les paiements des occupants,
 * moyens proposés aux occupants, et moyen de paiement de l'abonnement Keyo.
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
  const sub = (accounts ?? []).find((a) => a.purpose === "SUBSCRIPTION");
  const verified = receive.some((a) => a.status === "VERIFIED");
  const uncovered = assets.filter((as) => !receivingAccountFor(receive, as.id));
  const detail = (a: PaymentAccountView) => {
    const names = a.assetIds.map((id) => assets.find((x) => x.id === id)?.name).filter(Boolean);
    return [a.holder, a.isDefault ? "par défaut" : undefined, names.length ? names.join(", ") : undefined].filter(Boolean).join(" · ");
  };
  const set = (patch: Partial<typeof settings.paymentMethods>) => session.updateSettings({ paymentMethods: { ...settings.paymentMethods, ...patch } });

  return (
    <SubScreen
      title="Recevoir mes loyers"
      subtitle="Les paiements de vos occupants arrivent directement sur vos comptes. Keyo ne détient jamais vos fonds."
      footer={<Button label="Ajouter un compte de réception" icon={Plus} onPress={() => router.push({ pathname: "/encaissement/ajouter", params: { purpose: "RECEIVE" } })} />}
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
          title="Vos comptes de réception"
          footer={verified && uncovered.length ? `Sans compte attribué ni compte par défaut : ${uncovered.map((a) => a.name).join(", ")}.` : "Chaque modification est confirmée par un code envoyé par SMS."}
        >
          {receive.map((a) => (
            <AccountRow key={a.id} account={a} detail={detail(a)} onPress={() => router.push({ pathname: "/encaissement/[id]", params: { id: a.id } })} />
          ))}
        </SettingsGroup>
      )}

      <SettingsGroup title="Moyens proposés à vos occupants" footer="Les paiements passent par notre partenaire de paiement agréé.">
        <ToggleRow title="Mobile Money" subtitle="Wave, Orange Money, MTN, Moov." value={settings.paymentMethods.mobileMoney} onChange={(v) => set({ mobileMoney: v })} />
        <ToggleRow title="Carte bancaire" value={settings.paymentMethods.card} onChange={(v) => set({ card: v })} />
        <ToggleRow title="Virement" value={settings.paymentMethods.bankTransfer} onChange={(v) => set({ bankTransfer: v })} />
      </SettingsGroup>

      <SettingsGroup title="Abonnement Keyo" footer="Le moyen avec lequel vous réglez votre abonnement. Distinct de vos comptes de réception.">
        {sub ? (
          <AccountRow account={sub} detail={sub.holder} onPress={() => router.push({ pathname: "/encaissement/[id]", params: { id: sub.id } })} />
        ) : (
          <NavRow icon={CreditCard} tint="mintTint" ink="mintDeep" title="Ajouter un moyen de paiement" value="Mobile Money" onPress={() => router.push({ pathname: "/encaissement/ajouter", params: { purpose: "SUBSCRIPTION" } })} />
        )}
      </SettingsGroup>
    </SubScreen>
  );
}
