import { useState } from "react";
import { KeyboardAvoidingView } from "react-native";
import { router } from "expo-router";
import type { Currency } from "@keyo/shared";
import { session, useSession } from "@/data/session";
import { Button, CurrencySelect, SubScreen, Text, TextField } from "@/ui";

export default function ProfileStep() {
  const s = useSession();
  const user = s.status === "signedIn" ? s.user : undefined;
  const [firstName, setFirstName] = useState(user?.firstName ?? "");
  const [lastName, setLastName] = useState(user?.lastName ?? "");
  const [currency, setCurrency] = useState<Currency>(user?.displayCurrency ?? "XOF");
  const ok = firstName.trim().length > 1 && lastName.trim().length > 0;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
      <SubScreen
        title="Faisons connaissance"
        subtitle="Votre nom apparaît sur les quittances et les messages envoyés à vos locataires."
        footer={
          <Button
            label="Commencer"
            disabled={!ok}
            onPress={() => {
              session.update({ firstName: firstName.trim(), lastName: lastName.trim(), displayCurrency: currency });
              router.replace("/");
            }}
          />
        }
      >
        <TextField label="Prénom" value={firstName} onChangeText={setFirstName} autoCapitalize="words" textContentType="givenName" autoFocus />
        <TextField label="Nom" value={lastName} onChangeText={setLastName} autoCapitalize="words" textContentType="familyName" />
        <CurrencySelect value={currency} onChange={setCurrency} />
        <Text variant="caption" tone="inkMuted" style={{ marginTop: 10 }}>
          Les loyers restent encaissés dans la devise de chaque bien ; la conversion arrivera avec le multi-devises.
        </Text>
      </SubScreen>
    </KeyboardAvoidingView>
  );
}
