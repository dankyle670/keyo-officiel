import { useState } from "react";
import { Alert, Pressable, Share, View } from "react-native";
import { Check, Landmark } from "lucide-react-native";
import { color, radius } from "@keyo/tokens";
import { fullDate } from "@/data/period";
import { shareStatus } from "@/data/selectors";
import { actions, useOwnerState, type PassportShare } from "@/data/store";
import { Button, Chip, IconCircle, ListRow, SectionTitle, Segmented, Status, SubScreen, Text, TextField } from "@/ui";

const SCOPES: { key: PassportShare["scopes"][number]; title: string; detail: string }[] = [
  { key: "SCORE", title: "Score et niveau", detail: "Votre score Keyo et le détail des critères." },
  { key: "INCOME", title: "Revenus certifiés", detail: "Loyers encaissés sur 12 mois, taux d'encaissement." },
  { key: "PATRIMONY", title: "Patrimoine", detail: "Valeur de votre part des biens." },
  { key: "ASSETS", title: "Détail par bien", detail: "Nom, ville, loyer et occupation de chaque bien, sans les noms des locataires." },
];
const DAYS = [7, 30, 90];

/** Partager le passeport : consentement explicite, durée limitée, révocation à tout moment. */
export default function SharePassport() {
  const shares = useOwnerState((s) => s.passport.shares);
  const [kind, setKind] = useState<PassportShare["institutionKind"]>("BANK");
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<PassportShare["scopes"]>(["SCORE", "INCOME"]);
  const [days, setDays] = useState(30);
  const [consent, setConsent] = useState(false);
  const ok = name.trim().length > 1 && scopes.length > 0 && consent;

  const share = () => {
    const s = actions.sharePassport({ institution: name.trim(), institutionKind: kind, scopes, days });
    setName("");
    setConsent(false);
    Share.share({
      message: `Passeport propriétaire Keyo. Code de vérification : ${s.code}, valable jusqu'au ${fullDate(s.expiresAt.slice(0, 10))}. Consultation : https://keyo.app/v/${s.code}`,
    });
  };
  const revoke = (s: PassportShare) =>
    Alert.alert(`Arrêter le partage avec ${s.institution} ?`, "Le code ne permettra plus de consulter votre passeport.", [
      { text: "Annuler", style: "cancel" },
      { text: "Arrêter", style: "destructive", onPress: () => actions.revokePassportShare(s.id) },
    ]);

  return (
    <SubScreen title="Partager mon passeport" footer={<Button label="Partager" disabled={!ok} onPress={share} />}>
      <SectionTitle>Avec qui</SectionTitle>
      <Segmented
        value={kind}
        onChange={setKind}
        options={[
          { value: "BANK", label: "Banque" },
          { value: "MICROFINANCE", label: "Microfinance" },
          { value: "OTHER", label: "Autre" },
        ]}
      />
      <TextField label="Nom de l'établissement" value={name} onChangeText={setName} placeholder={kind === "MICROFINANCE" ? "Ex. Advans, Baobab" : "Ex. votre banque"} />

      <SectionTitle>Ce qu'il pourra voir</SectionTitle>
      {SCOPES.map((sc) => {
        const on = scopes.includes(sc.key);
        return (
          <Pressable
            key={sc.key}
            onPress={() => setScopes((list) => (on ? list.filter((x) => x !== sc.key) : [...list, sc.key]))}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: on }}
            style={{ flexDirection: "row", gap: 14, alignItems: "center", paddingVertical: 12 }}
          >
            <Box on={on} />
            <View style={{ flex: 1 }}>
              <Text variant="rowTitle">{sc.title}</Text>
              <Text variant="rowSubtitle" tone="inkMuted">
                {sc.detail}
              </Text>
            </View>
          </Pressable>
        );
      })}

      <SectionTitle>Pendant</SectionTitle>
      <View style={{ flexDirection: "row", gap: 8 }}>
        {DAYS.map((d) => (
          <Chip key={d} active={d === days} label={`${d} jours`} onPress={() => setDays(d)} />
        ))}
      </View>

      <Pressable onPress={() => setConsent((v) => !v)} accessibilityRole="checkbox" accessibilityState={{ checked: consent }} style={{ flexDirection: "row", gap: 14, alignItems: "flex-start", marginTop: 22, padding: 16, borderRadius: radius.card, backgroundColor: color.surfaceRaised }}>
        <Box on={consent} />
        <Text variant="rowSubtitle" style={{ flex: 1 }}>
          {`J'autorise ${name.trim() || "cet établissement"} à consulter ces informations pendant ${days} jours. Je peux arrêter ce partage à tout moment ; chaque consultation est enregistrée.`}
        </Text>
      </Pressable>

      {shares.length > 0 && <SectionTitle>Partages</SectionTitle>}
      {[...shares].reverse().map((s, i) => {
        const st = shareStatus(s);
        return (
          <ListRow
            key={s.id}
            divider={i > 0}
            leading={<IconCircle icon={Landmark} />}
            title={s.institution}
            subtitle={`Code ${s.code} · ${st === "ACTIVE" ? `jusqu'au ${fullDate(s.expiresAt.slice(0, 10))}` : st === "REVOKED" ? "arrêté" : "expiré"} · ${s.accesses.length ? `${s.accesses.length} consultation${s.accesses.length > 1 ? "s" : ""}` : "pas encore consulté"}`}
            trailing={<Status tone={st === "ACTIVE" ? "paid" : "neutral"} label={st === "ACTIVE" ? "Actif" : st === "REVOKED" ? "Arrêté" : "Expiré"} />}
            onPress={st === "ACTIVE" ? () => revoke(s) : undefined}
          />
        );
      })}
      {shares.some((s) => shareStatus(s) === "ACTIVE") && (
        <Text variant="caption" tone="inkMuted" style={{ marginTop: 8 }}>
          Touchez un partage actif pour l'arrêter.
        </Text>
      )}
      <Text variant="caption" tone="inkMuted" style={{ marginTop: 16 }}>
        La consultation en ligne par l'établissement sera ouverte avec le serveur Keyo. Pour l'instant, le code et l'attestation se transmettent par message.
      </Text>
    </SubScreen>
  );
}

function Box({ on }: { on: boolean }) {
  return (
    <View style={{ width: 26, height: 26, borderRadius: 8, borderWidth: 2, borderColor: on ? color.mint : color.track, backgroundColor: on ? color.mint : "transparent", alignItems: "center", justifyContent: "center" }}>
      {on && <Check size={16} strokeWidth={2.4} color={color.night} />}
    </View>
  );
}
