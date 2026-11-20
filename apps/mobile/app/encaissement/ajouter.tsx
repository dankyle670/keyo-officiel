import { useState } from "react";
import { Pressable, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { isIvorianMobile, isValidIban, MOBILE_MONEY_OPERATORS, OPERATOR_LABEL, type MobileMoneyOperator } from "@keyo/shared";
import { color, fontFamily } from "@keyo/tokens";
import { useUser } from "@/data/session";
import { useOwnerState } from "@/data/store";
import { paymentApi, PaymentApiError, type Challenge } from "@/payments/api";
import { CodeSheet } from "@/payments/CodeSheet";
import { Button, Segmented, SettingsGroup, SubScreen, Text, TextField, ToggleRow } from "@/ui";

/** Ajout d'un compte : saisie, puis code SMS pour le vérifier. */
export default function AddAccount() {
  const { purpose: p } = useLocalSearchParams<{ purpose?: string }>();
  const purpose: "RECEIVE" | "SUBSCRIPTION" = p === "SUBSCRIPTION" ? "SUBSCRIPTION" : "RECEIVE";
  const user = useUser();
  const assets = useOwnerState((s) => s.assets);
  const hasDefault = useOwnerState((s) => (s.paymentAccounts ?? []).some((a) => a.purpose === "RECEIVE" && a.isDefault && a.status === "VERIFIED"));
  const [kind, setKind] = useState<"MOBILE_MONEY" | "BANK">("MOBILE_MONEY");
  const [operator, setOperator] = useState<MobileMoneyOperator>("WAVE");
  const [phone, setPhone] = useState("");
  const [bankName, setBankName] = useState("");
  const [iban, setIban] = useState("");
  const [holder, setHolder] = useState(`${user.firstName ?? ""} ${user.lastName ?? ""}`.trim());
  const [assetIds, setAssetIds] = useState<string[]>([]);
  const [isDefault, setIsDefault] = useState(!hasDefault);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [challenge, setChallenge] = useState<Challenge>();

  const e164 = `+225${phone.replace(/\D/g, "")}`;
  const phoneOk = isIvorianMobile(e164);
  const ibanOk = isValidIban(iban);
  const valid = holder.trim().length >= 2 && (kind === "MOBILE_MONEY" ? phoneOk : ibanOk && bankName.trim().length >= 2);

  const submit = async () => {
    setBusy(true);
    setError(undefined);
    try {
      const base = { purpose, holder: holder.trim(), assetIds: purpose === "RECEIVE" ? assetIds : [], isDefault: purpose === "RECEIVE" ? isDefault : true };
      const r = await paymentApi.create(kind === "MOBILE_MONEY" ? { ...base, kind, operator, phone: e164 } : { ...base, kind, purpose: "RECEIVE", bankName: bankName.trim(), iban });
      setChallenge(r.challenge);
    } catch (e) {
      setError(e instanceof PaymentApiError ? e.message : "Ajout impossible.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SubScreen
      title={purpose === "SUBSCRIPTION" ? "Payer mon abonnement" : "Nouveau compte de réception"}
      subtitle={purpose === "SUBSCRIPTION" ? "Votre abonnement Keyo sera prélevé sur ce compte, avec votre accord à chaque échéance." : "Les loyers payés en ligne par vos occupants arriveront ici."}
      footer={<Button label={busy ? "Envoi du code…" : "Recevoir le code de vérification"} disabled={!valid || busy} onPress={submit} />}
    >
      {purpose === "RECEIVE" ? (
        <Segmented
          value={kind}
          options={[
            { value: "MOBILE_MONEY", label: "Mobile Money" },
            { value: "BANK", label: "Compte bancaire" },
          ]}
          onChange={setKind}
        />
      ) : (
        <Segmented
          value="MOBILE_MONEY"
          options={[
            { value: "MOBILE_MONEY", label: "Mobile Money" },
            { value: "CARD", label: "Carte, bientôt", disabled: true },
          ]}
          onChange={() => undefined}
        />
      )}

      {kind === "MOBILE_MONEY" ? (
        <>
          <Text variant="rowSubtitle" tone="inkMuted" style={{ marginTop: 16 }}>
            Opérateur
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 }} accessibilityRole="radiogroup">
            {MOBILE_MONEY_OPERATORS.map((o) => {
              const active = o === operator;
              return (
                <Pressable
                  key={o}
                  onPress={() => setOperator(o)}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: active }}
                  style={{ height: 44, paddingHorizontal: 18, borderRadius: 999, justifyContent: "center", backgroundColor: active ? color.night : color.surfaceRaised }}
                >
                  <Text variant="rowTitle" tone={active ? "onNight" : "ink"} style={{ fontFamily: fontFamily.semibold }}>
                    {OPERATOR_LABEL[o]}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <TextField
            label="Numéro Mobile Money"
            value={phone}
            onChangeText={(t) => setPhone(t.replace(/\D/g, "").slice(0, 10).replace(/(\d{2})(?=\d)/g, "$1 "))}
            keyboardType="phone-pad"
            placeholder="07 00 00 00 00"
            leading={<Text variant="rowTitle">+225</Text>}
            hint="Le code de vérification sera envoyé sur ce numéro."
            error={phone.replace(/\D/g, "").length === 10 && !phoneOk ? "Numéro ivoirien attendu, commençant par 01, 05 ou 07." : undefined}
          />
        </>
      ) : (
        <>
          <TextField label="Banque" value={bankName} onChangeText={setBankName} placeholder="SGBCI, Ecobank, NSIA…" autoCapitalize="characters" />
          <TextField
            label="IBAN"
            value={iban}
            onChangeText={(t) => setIban(t.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 34).replace(/(.{4})(?=.)/g, "$1 "))}
            autoCapitalize="characters"
            autoCorrect={false}
            placeholder="CI93 CI00 8011 …"
            hint="Le code de vérification sera envoyé sur votre numéro de téléphone."
            error={iban.replace(/\s/g, "").length >= 15 && !ibanOk ? "IBAN invalide : vérifiez les caractères." : undefined}
          />
        </>
      )}

      <TextField label="Titulaire du compte" value={holder} onChangeText={setHolder} autoCapitalize="words" hint="Nom exact enregistré chez l'opérateur ou la banque." />

      {purpose === "RECEIVE" && (
        <>
          <SettingsGroup footer="Les biens sans compte attribué utilisent le compte par défaut.">
            <ToggleRow title="Compte par défaut" value={isDefault} onChange={setIsDefault} />
          </SettingsGroup>
          {assets.length > 0 && (
            <SettingsGroup title="Réservé à certains biens (facultatif)">
              {assets.map((a) => (
                <ToggleRow key={a.id} title={a.name} value={assetIds.includes(a.id)} onChange={(v) => setAssetIds((ids) => (v ? [...ids, a.id] : ids.filter((x) => x !== a.id)))} />
              ))}
            </SettingsGroup>
          )}
        </>
      )}

      {error && (
        <Text variant="rowSubtitle" tone="danger" style={{ marginTop: 16 }}>
          {error}
        </Text>
      )}

      <CodeSheet
        challenge={challenge}
        title="Vérifier le compte"
        onClose={() => {
          // Le compte reste « À vérifier » : on pourra relancer la vérification depuis sa fiche.
          setChallenge(undefined);
          router.back();
        }}
        onDone={() => {
          setChallenge(undefined);
          router.back();
        }}
      />
    </SubScreen>
  );
}
