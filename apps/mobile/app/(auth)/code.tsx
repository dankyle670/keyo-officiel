import { useEffect, useRef, useState, type ComponentRef } from "react";
import { KeyboardAvoidingView, Pressable, TextInput, View } from "react-native";
import { router } from "expo-router";
import { color, fontFamily, radius } from "@keyo/tokens";
import { DEMO_OTP, getSession, session, useSession } from "@/data/session";
import { Button, SubScreen, Text } from "@/ui";

const LENGTH = 6;
const RESEND_AFTER = 30;

/** Code SMS à 6 chiffres. Saisie automatique depuis le SMS sur iOS (oneTimeCode). */
export default function CodeStep() {
  const s = useSession();
  const pending = s.status === "signedOut" ? s.pendingPhone : undefined;
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string>();
  const [checking, setChecking] = useState(false);
  const [wait, setWait] = useState(RESEND_AFTER);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait(wait - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  const verify = async (value: string) => {
    setChecking(true);
    const result = await session.verifyOtp(value);
    setChecking(false);
    if (result === "invalid") {
      setError("Ce code ne correspond pas. Vérifiez le SMS ou demandez un nouveau code.");
      setCode("");
      return;
    }
    const now = getSession();
    const user = now.status === "signedIn" ? now.user : undefined;
    router.replace(user?.role && user.firstName ? "/" : "/(auth)/role");
  };

  const onChange = (t: string) => {
    const digits = t.replace(/\D/g, "").slice(0, LENGTH);
    setError(undefined);
    setCode(digits);
    if (digits.length === LENGTH) verify(digits);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
      <SubScreen
        title="Code reçu par SMS"
        subtitle={pending ? `Envoyé au ${pending.phone}.` : undefined}
        footer={<Button label={checking ? "Vérification…" : "Valider"} disabled={code.length < LENGTH || checking} onPress={() => verify(code)} />}
      >
        <Pressable onPress={() => input.current?.focus()} style={{ flexDirection: "row", gap: 8, marginTop: 28 }} accessibilityLabel="Saisir le code">
          {Array.from({ length: LENGTH }, (_, i) => {
            const active = i === code.length;
            return (
              <View
                key={i}
                style={{
                  flex: 1,
                  height: 60,
                  borderRadius: radius.md,
                  backgroundColor: color.surfaceRaised,
                  alignItems: "center",
                  justifyContent: "center",
                  borderWidth: 2,
                  borderColor: error ? color.danger : active ? color.mint : "transparent",
                }}
              >
                <Text variant="title" tabular>
                  {code[i] ?? ""}
                </Text>
              </View>
            );
          })}
        </Pressable>
        <TextInput
          ref={input}
          value={code}
          onChangeText={onChange}
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          autoComplete="sms-otp"
          autoFocus
          maxLength={LENGTH}
          style={{ position: "absolute", opacity: 0, height: 1, width: 1 }}
        />
        {error ? (
          <Text variant="rowSubtitle" tone="danger" style={{ marginTop: 14 }}>
            {error}
          </Text>
        ) : null}
        <Pressable
          disabled={wait > 0 || !pending}
          onPress={() => {
            if (!pending) return;
            session.requestOtp(pending.phone, pending.country, pending.currency);
            setWait(RESEND_AFTER);
          }}
          style={{ marginTop: 22 }}
        >
          <Text variant="rowTitle" tone={wait > 0 ? "inkMuted" : "sky"} style={{ fontFamily: fontFamily.bold }}>
            {wait > 0 ? `Renvoyer le code dans ${wait} s` : "Renvoyer le code"}
          </Text>
        </Pressable>
        {__DEV__ && (
          <Text variant="caption" tone="inkMuted" style={{ marginTop: 18 }}>
            Version de démonstration : aucun SMS n'est envoyé, le code est {DEMO_OTP}.
          </Text>
        )}
      </SubScreen>
    </KeyboardAvoidingView>
  );
}
