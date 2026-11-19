import { useState } from "react";
import { KeyboardAvoidingView, Pressable, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { ChevronDown } from "lucide-react-native";
import { formatLocal, PHONE_COUNTRIES, toE164, type PhoneCountry } from "@keyo/shared";
import { color, fontFamily } from "@keyo/tokens";
import { session } from "@/data/session";
import { Button, Sheet, SheetAction, SubScreen, Text, TextField } from "@/ui";

/** Numéro de téléphone : identifiant unique du compte (indispensable en Afrique de l'Ouest). */
export default function PhoneStep() {
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const [country, setCountry] = useState<PhoneCountry>(PHONE_COUNTRIES[0]);
  const [local, setLocal] = useState("");
  const [picker, setPicker] = useState(false);
  const [sending, setSending] = useState(false);
  const e164 = toE164(country, local);

  const submit = async () => {
    if (!e164) return;
    setSending(true);
    await session.requestOtp(e164, country.code, country.currency);
    setSending(false);
    router.push("/(auth)/code");
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
      <SubScreen
        title={mode === "login" ? "Bon retour" : "Votre numéro"}
        subtitle="Nous vous envoyons un code par SMS pour vérifier qu'il s'agit bien de vous."
        footer={<Button label={sending ? "Envoi du code…" : "Recevoir un code"} disabled={!e164 || sending} onPress={submit} />}
      >
        <TextField
          label="Numéro de téléphone"
          value={formatLocal(country, local)}
          onChangeText={(t) => setLocal(t.replace(/\D/g, ""))}
          keyboardType="phone-pad"
          textContentType="telephoneNumber"
          autoComplete="tel"
          autoFocus
          placeholder={country.code === "CI" ? "07 00 00 00 00" : country.code === "FR" ? "06 12 34 56 78" : "555 123 4567"}
          leading={
            <Pressable onPress={() => setPicker(true)} accessibilityRole="button" accessibilityLabel={`Indicatif ${country.label}`} style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingRight: 10, borderRightWidth: 1, borderRightColor: color.line }}>
              <Text variant="rowTitle" style={{ fontFamily: fontFamily.bold }}>
                {country.dial}
              </Text>
              <ChevronDown size={16} strokeWidth={1.8} color={color.inkMuted} />
            </Pressable>
          }
          hint={`${country.label}. La devise d'affichage sera ${country.currency === "XOF" ? "le FCFA" : country.currency}, modifiable ensuite.`}
        />
        <Text variant="caption" tone="inkMuted" style={{ marginTop: 24 }}>
          En continuant, vous acceptez les conditions d'utilisation et la politique de confidentialité de Keyo.
        </Text>
      </SubScreen>
      <Sheet visible={picker} onClose={() => setPicker(false)} title="Pays">
        <View>
          {PHONE_COUNTRIES.map((c) => (
            <SheetAction
              key={c.code}
              label={`${c.label}  ${c.dial}${c.code === country.code ? "  ·  choisi" : ""}`}
              onPress={() => {
                setCountry(c);
                setPicker(false);
              }}
            />
          ))}
        </View>
      </Sheet>
    </KeyboardAvoidingView>
  );
}
