import { useEffect, useState } from "react";
import { View } from "react-native";
import { Button, Sheet, Text, TextField } from "@/ui";
import { paymentApi, PaymentApiError, type Challenge } from "./api";

/**
 * Saisie du code reçu par SMS, pour vérifier, modifier ou supprimer un compte de paiement.
 * Sans fournisseur SMS branché (développement), le code de démonstration est affiché.
 */
export function CodeSheet({ challenge, title, onClose, onDone }: { challenge?: Challenge; title: string; onClose: () => void; onDone: () => void }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setCode("");
    setError(undefined);
  }, [challenge?.challengeId]);

  const confirm = async () => {
    if (!challenge) return;
    setBusy(true);
    setError(undefined);
    try {
      await paymentApi.confirm(challenge.challengeId, code);
      onDone();
    } catch (e) {
      setError(e instanceof PaymentApiError ? e.message : "Échec de la vérification.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet visible={Boolean(challenge)} onClose={onClose} title={title}>
      {challenge && (
        <View>
          <Text variant="body" tone="inkMuted">
            Nous avons envoyé un code à 6 chiffres à {challenge.sentTo}. Il est valable {Math.round(challenge.expiresInSeconds / 60)} minutes.
          </Text>
          {challenge.simulated && (
            <Text variant="caption" tone="inkMuted" style={{ marginTop: 8 }}>
              Mode démonstration : aucun SMS n'est envoyé, le code est 123456.
            </Text>
          )}
          <TextField
            label="Code reçu"
            value={code}
            onChangeText={(t) => setCode(t.replace(/\D/g, "").slice(0, 6))}
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            autoComplete="sms-otp"
            autoFocus
            error={error}
          />
          <View style={{ marginTop: 20 }}>
            <Button label={busy ? "Vérification…" : "Confirmer"} disabled={code.length !== 6 || busy} onPress={confirm} />
          </View>
        </View>
      )}
    </Sheet>
  );
}
