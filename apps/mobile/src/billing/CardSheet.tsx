import { useEffect, useState } from "react";
import { View } from "react-native";
import { Lock } from "lucide-react-native";
import { CARD_BRAND_LABEL, cardBrand, cardExpired, luhnValid } from "@keyo/shared";
import { color, radius } from "@keyo/tokens";
import { today } from "@/data/period";
import { paymentApi, PaymentApiError } from "@/payments/api";
import { Button, Sheet, Text, TextField } from "@/ui";
import { simulateTokenize } from "./provider";

/**
 * Formulaire de carte du prestataire de paiement (simulé). Le numéro et le cryptogramme restent
 * dans ce formulaire : seul un jeton part vers Keyo. Le cryptogramme n'est conservé nulle part.
 */
export function CardSheet({ visible, onClose, onDone }: { visible: boolean; onClose: () => void; onDone: () => void }) {
  const [number, setNumber] = useState("");
  const [exp, setExp] = useState("");
  const [cvc, setCvc] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!visible) {
      setNumber("");
      setExp("");
      setCvc("");
      setError(undefined);
    }
  }, [visible]);

  const digits = number.replace(/\D/g, "");
  const brand = cardBrand(digits);
  const [mm, yy] = exp.split("/");
  const expMonth = Number(mm);
  const expYear = 2000 + Number(yy);
  const expOk = /^\d{2}\/\d{2}$/.test(exp) && expMonth >= 1 && expMonth <= 12 && !cardExpired(expMonth, expYear, today());
  const numOk = luhnValid(digits);
  const cvcOk = cvc.length === (brand === "AMEX" ? 4 : 3);

  const save = async () => {
    setBusy(true);
    setError(undefined);
    try {
      await paymentApi.addCard(simulateTokenize(digits, expMonth, expYear));
      onDone();
    } catch (e) {
      setError(e instanceof PaymentApiError ? e.message : "Carte non enregistrée.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet visible={visible} onClose={onClose} title="Ajouter une carte">
      <View style={{ flexDirection: "row", gap: 8, alignItems: "center", padding: 12, borderRadius: radius.card, backgroundColor: color.surfaceRaised }}>
        <Lock size={18} strokeWidth={1.8} color={color.mintDeep} />
        <Text variant="caption" tone="inkMuted" style={{ flex: 1 }}>
          Démonstration : aucune carte n'est débitée. Essayez 4242 4242 4242 4242. Plus tard, ce formulaire sera celui de notre prestataire de paiement : Keyo ne verra jamais votre numéro complet.
        </Text>
      </View>
      <TextField
        label="Numéro de carte"
        value={number}
        onChangeText={(t) => setNumber(t.replace(/\D/g, "").slice(0, 19).replace(/(\d{4})(?=\d)/g, "$1 "))}
        keyboardType="number-pad"
        textContentType="creditCardNumber"
        autoComplete="cc-number"
        placeholder="1234 1234 1234 1234"
        hint={digits.length >= 4 ? CARD_BRAND_LABEL[brand] : undefined}
        error={digits.length >= 13 && !numOk ? "Numéro invalide : vérifiez les chiffres." : undefined}
      />
      <View style={{ flexDirection: "row", gap: 12 }}>
        <View style={{ flex: 1 }}>
          <TextField
            label="Expiration"
            value={exp}
            onChangeText={(t) => {
              const d = t.replace(/\D/g, "").slice(0, 4);
              setExp(d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d);
            }}
            keyboardType="number-pad"
            autoComplete="cc-exp"
            placeholder="MM/AA"
            error={exp.length === 5 && !expOk ? "Date invalide ou passée." : undefined}
          />
        </View>
        <View style={{ flex: 1 }}>
          <TextField label="Cryptogramme" value={cvc} onChangeText={(t) => setCvc(t.replace(/\D/g, "").slice(0, 4))} keyboardType="number-pad" autoComplete="cc-csc" secureTextEntry placeholder="123" />
        </View>
      </View>
      {error && (
        <Text variant="rowSubtitle" tone="danger" style={{ marginTop: 12 }}>
          {error}
        </Text>
      )}
      <View style={{ marginTop: 20 }}>
        <Button label={busy ? "Enregistrement…" : "Enregistrer la carte"} disabled={!numOk || !expOk || !cvcOk || busy} onPress={save} />
      </View>
    </Sheet>
  );
}
