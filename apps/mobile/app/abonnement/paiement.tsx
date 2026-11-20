import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Smartphone } from "lucide-react-native";
import { formatMoney, type PaymentAttemptView } from "@keyo/shared";
import { color, radius } from "@keyo/tokens";
import { billingApi, BillingApiError, refreshSubscription } from "@/billing/api";
import { Button, Status, SubScreen, Text } from "@/ui";

/**
 * Paiement Mobile Money de l'abonnement : la demande arrive sur le téléphone du propriétaire, qui
 * la valide avec son code. L'écran suit son statut ; seul le webhook du prestataire la marque payée.
 */
export default function PaymentProgress() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [a, setA] = useState<PaymentAttemptView>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    let live = true;
    const poll = async () => {
      try {
        const next = await billingApi.attempt(id);
        if (!live) return;
        setA(next);
        if (next.status !== "PENDING") void refreshSubscription();
        else setTimeout(poll, 3000);
      } catch (e) {
        if (live) setError(e instanceof BillingApiError ? e.message : "Suivi indisponible.");
      }
    };
    void poll();
    return () => {
      live = false;
    };
  }, [id]);

  const simulate = async (approve: boolean) => {
    try {
      setA(await billingApi.simulate(id, approve));
      void refreshSubscription();
    } catch (e) {
      setError(e instanceof BillingApiError ? e.message : "Action impossible.");
    }
  };

  const done = a && a.status !== "PENDING";
  return (
    <SubScreen
      title={done ? (a.status === "SUCCEEDED" ? "Paiement reçu" : "Paiement non abouti") : "Validez sur votre téléphone"}
      footer={done ? <Button label="Terminer" onPress={() => router.back()} /> : undefined}
    >
      <View style={{ marginTop: 20, padding: 22, borderRadius: radius.card, backgroundColor: color.surfaceRaised, gap: 12, alignItems: "flex-start" }}>
        <Smartphone size={28} strokeWidth={1.8} color={color.mintDeep} />
        {a ? <Text variant="title">{formatMoney(a.amount)}</Text> : null}
        {!a ? (
          <ActivityIndicator color={color.mintDeep} />
        ) : a.status === "PENDING" ? (
          <>
            <Status tone="info" label="En attente de votre validation" />
            <Text variant="body" tone="inkMuted">
              Une demande de paiement a été envoyée sur votre téléphone. Composez votre code secret pour l'accepter. Elle expire au bout de 15 minutes.
            </Text>
          </>
        ) : a.status === "SUCCEEDED" ? (
          <>
            <Status tone="paid" label="Payé" />
            <Text variant="body" tone="inkMuted">
              Merci, votre abonnement est à jour. Le reçu est dans Mon abonnement.
            </Text>
          </>
        ) : (
          <>
            <Status tone="danger" label={a.status === "EXPIRED" ? "Expiré" : "Refusé"} />
            <Text variant="body" tone="inkMuted">
              {a.failureReason ?? "Le paiement n'a pas abouti."} Vous pouvez réessayer depuis Mon abonnement.
            </Text>
          </>
        )}
      </View>

      {a?.status === "PENDING" ? (
        <View style={{ marginTop: 20, gap: 10 }}>
          <Text variant="caption" tone="inkMuted">
            Démonstration : aucun opérateur n'est encore branché. Simulez la réponse de votre téléphone.
          </Text>
          <Button kind="secondary" label="Simuler : j'accepte" onPress={() => simulate(true)} />
          <Button kind="secondary" label="Simuler : je refuse" onPress={() => simulate(false)} />
        </View>
      ) : null}

      {error ? (
        <Text variant="rowSubtitle" tone="danger" style={{ marginTop: 12 }}>
          {error}
        </Text>
      ) : null}
    </SubScreen>
  );
}
