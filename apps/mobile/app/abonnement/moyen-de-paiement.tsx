import { useState } from "react";
import { Alert } from "react-native";
import { router } from "expo-router";
import { CreditCard, Smartphone } from "lucide-react-native";
import { isIvorianMobile, type MobileMoneyOperator } from "@keyo/shared";
import { CardSheet } from "@/billing/CardSheet";
import { useUser } from "@/data/session";
import { useOwnerState } from "@/data/store";
import { paymentApi, PaymentApiError, type Challenge } from "@/payments/api";
import { CodeSheet } from "@/payments/CodeSheet";
import { OperatorPicker } from "@/payments/OperatorPicker";
import { ActionRow, Button, InfoRow, NavRow, SettingsGroup, SubScreen, Text, TextField } from "@/ui";

/**
 * Moyen de paiement de l'abonnement : la carte ou le Mobile Money PERSONNEL du propriétaire,
 * qui sert uniquement à payer Keyo. Sans lien avec les comptes où arrivent les loyers.
 */
export default function SubscriptionPaymentMethod() {
  const user = useUser();
  const method = useOwnerState((s) => (s.paymentAccounts ?? []).find((a) => a.purpose === "SUBSCRIPTION"));
  const [mode, setMode] = useState<"view" | "MOBILE_MONEY">("view");
  const [cardOpen, setCardOpen] = useState(false);
  const [operator, setOperator] = useState<MobileMoneyOperator>("WAVE");
  const [phone, setPhone] = useState("");
  const [challenge, setChallenge] = useState<{ c: Challenge; op: "VERIFY" | "DELETE" }>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const e164 = `+225${phone.replace(/\D/g, "")}`;
  const phoneOk = isIvorianMobile(e164);

  const addMobileMoney = async () => {
    setBusy(true);
    setError(undefined);
    try {
      const holder = `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || "Titulaire";
      const r = await paymentApi.create({ kind: "MOBILE_MONEY", purpose: "SUBSCRIPTION", operator, phone: e164, holder, assetIds: [], isDefault: true });
      setChallenge({ c: r.challenge, op: "VERIFY" });
    } catch (e) {
      setError(e instanceof PaymentApiError ? e.message : "Ajout impossible.");
    } finally {
      setBusy(false);
    }
  };

  const remove = () =>
    method &&
    Alert.alert("Retirer ce moyen de paiement ?", "Un code vous sera envoyé pour confirmer.", [
      { text: "Annuler", style: "cancel" },
      {
        text: "Retirer",
        style: "destructive",
        onPress: async () => {
          try {
            setChallenge({ c: await paymentApi.requestChange(method.id, { op: "DELETE" }), op: "DELETE" });
          } catch (e) {
            setError(e instanceof PaymentApiError ? e.message : "Action impossible.");
          }
        },
      },
    ]);

  if (mode === "MOBILE_MONEY") {
    return (
      <SubScreen
        title="Mobile Money"
        subtitle="À chaque échéance, vous recevez une demande à valider avec votre code."
        onBack={() => setMode("view")}
        footer={<Button label={busy ? "Envoi du code…" : "Recevoir le code de vérification"} disabled={!phoneOk || busy} onPress={addMobileMoney} />}
      >
        <OperatorPicker value={operator} onChange={setOperator} />
        <TextField
          label="Votre numéro"
          value={phone}
          onChangeText={(t) => setPhone(t.replace(/\D/g, "").slice(0, 10).replace(/(\d{2})(?=\d)/g, "$1 "))}
          keyboardType="phone-pad"
          placeholder="07 00 00 00 00"
          leading={<Text variant="rowTitle">+225</Text>}
          error={phone.replace(/\D/g, "").length === 10 && !phoneOk ? "Numéro ivoirien attendu, commençant par 01, 05 ou 07." : undefined}
        />
        {error ? (
          <Text variant="rowSubtitle" tone="danger" style={{ marginTop: 16 }}>
            {error}
          </Text>
        ) : null}
        <CodeSheet
          challenge={challenge?.c}
          title="Vérifier le numéro"
          onClose={() => setChallenge(undefined)}
          onDone={() => {
            setChallenge(undefined);
            router.back();
          }}
        />
      </SubScreen>
    );
  }

  return (
    <SubScreen title="Moyen de paiement" subtitle="Pour payer votre abonnement Keyo. Les loyers de vos locataires n'arrivent jamais ici.">
      {method ? (
        <SettingsGroup title="Actuel">
          <InfoRow title={method.kind === "CARD" ? "Carte" : method.label} value={method.masked} />
          {method.expiry ? <InfoRow title="Expiration" value={method.expiry} /> : null}
          <InfoRow title="Prélèvement" value={method.kind === "CARD" ? "Automatique" : "À valider à chaque échéance"} />
          {method.status !== "VERIFIED" ? <InfoRow title="Statut" value="À vérifier" /> : null}
        </SettingsGroup>
      ) : null}

      <SettingsGroup title={method ? "Remplacer par" : "Choisir"}>
        <NavRow icon={CreditCard} title="Carte bancaire" value="Visa, Mastercard…" onPress={() => setCardOpen(true)} />
        <NavRow icon={Smartphone} title="Mobile Money" value="Wave, Orange, MTN, Moov" onPress={() => setMode("MOBILE_MONEY")} />
      </SettingsGroup>

      {error ? (
        <Text variant="rowSubtitle" tone="danger" style={{ marginTop: 12 }}>
          {error}
        </Text>
      ) : null}

      {method ? (
        <SettingsGroup>
          <ActionRow title="Retirer ce moyen de paiement" destructive onPress={remove} />
        </SettingsGroup>
      ) : null}

      <CardSheet visible={cardOpen} onClose={() => setCardOpen(false)} onDone={() => (setCardOpen(false), router.back())} />
      <CodeSheet challenge={challenge?.c} title="Confirmer" onClose={() => setChallenge(undefined)} onDone={() => setChallenge(undefined)} />
    </SubScreen>
  );
}
