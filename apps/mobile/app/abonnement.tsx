import { useCallback, useState } from "react";
import { View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { CreditCard, Smartphone } from "lucide-react-native";
import { color, radius } from "@keyo/tokens";
import { CardSheet } from "@/billing/CardSheet";
import { useOwnerState } from "@/data/store";
import { AccountRow } from "@/payments/AccountRow";
import { refreshPaymentAccounts } from "@/payments/api";
import { Button, NavRow, SettingsGroup, SubScreen, Text } from "@/ui";

/** Mon abonnement : formule, moyen de paiement (carte ou Mobile Money), historique. */
export default function Subscription() {
  const method = useOwnerState((s) => (s.paymentAccounts ?? []).find((a) => a.purpose === "SUBSCRIPTION"));
  const [cardOpen, setCardOpen] = useState(false);
  useFocusEffect(
    useCallback(() => {
      void refreshPaymentAccounts();
    }, []),
  );

  return (
    <SubScreen
      title="Mon abonnement"
      subtitle="Un prix fixe chaque mois, quel que soit le montant de vos loyers."
      footer={<Button label={method ? "Remplacer par une carte" : "Ajouter une carte"} icon={CreditCard} onPress={() => setCardOpen(true)} />}
    >
      <View style={{ marginTop: 20, padding: 22, borderRadius: radius.card, backgroundColor: color.night, gap: 6 }}>
        <Text variant="rowSubtitle" tone="track">
          Formule
        </Text>
        <Text variant="title" tone="onNight">
          Keyo
        </Text>
        <Text variant="rowSubtitle" tone="track">
          Tarif communiqué prochainement. Aucun prélèvement pour l'instant.
        </Text>
      </View>

      <SettingsGroup title="Moyen de paiement" footer="Visa, Mastercard et autres cartes, ou Mobile Money. Le nouveau moyen remplace le précédent.">
        {method ? (
          <AccountRow account={method} detail={method.kind === "CARD" ? "Carte bancaire" : method.holder} onPress={() => router.push({ pathname: "/encaissement/[id]", params: { id: method.id } })} />
        ) : (
          <Text variant="rowSubtitle" tone="inkMuted" style={{ paddingVertical: 16 }}>
            Aucun moyen de paiement enregistré.
          </Text>
        )}
        {method?.kind !== "MOBILE_MONEY" ? (
          <NavRow icon={Smartphone} tint="mintTint" ink="mintDeep" title="Payer par Mobile Money" value="Wave, Orange, MTN, Moov" onPress={() => router.push({ pathname: "/encaissement/ajouter", params: { purpose: "SUBSCRIPTION" } })} />
        ) : null}
      </SettingsGroup>

      <SettingsGroup title="Historique">
        <Text variant="rowSubtitle" tone="inkMuted" style={{ paddingVertical: 16 }}>
          Aucun paiement pour l'instant.
        </Text>
      </SettingsGroup>

      <CardSheet visible={cardOpen} onClose={() => setCardOpen(false)} onDone={() => setCardOpen(false)} />
    </SubScreen>
  );
}
