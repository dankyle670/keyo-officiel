import { useState } from "react";
import { router } from "expo-router";
import { isIvorianMobile, isValidIban, type MobileMoneyOperator } from "@keyo/shared";
import { useUser } from "@/data/session";
import { useOwnerState } from "@/data/store";
import { paymentApi, PaymentApiError, type Challenge } from "@/payments/api";
import { CodeSheet } from "@/payments/CodeSheet";
import { OperatorPicker } from "@/payments/OperatorPicker";
import { Button, Segmented, SettingsGroup, SubScreen, Text, TextField, ToggleRow } from "@/ui";

/**
 * Nouveau compte de réception des loyers : saisie, puis code SMS pour le vérifier.
 * (Le moyen de paiement de l'abonnement Keyo a son propre écran : abonnement/moyen-de-paiement.)
 */
export default function AddAccount() {
  const purpose = "RECEIVE" as const;
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
      const base = { purpose, holder: holder.trim(), assetIds, isDefault };
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
      title="Nouveau compte de réception"
      subtitle="Les loyers payés en ligne par vos locataires arriveront sur ce compte."
      footer={<Button label={busy ? "Envoi du code…" : "Recevoir le code de vérification"} disabled={!valid || busy} onPress={submit} />}
    >
      <Segmented
        value={kind}
        options={[
          { value: "MOBILE_MONEY", label: "Mobile Money" },
          { value: "BANK", label: "Compte bancaire" },
        ]}
        onChange={setKind}
      />

      {kind === "MOBILE_MONEY" ? (
        <>
          <OperatorPicker value={operator} onChange={setOperator} />
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
