import { useState } from "react";
import { Share, View } from "react-native";
import { router } from "expo-router";
import { formatLocal, PHONE_COUNTRIES, toE164 } from "@keyo/shared";
import { useUser } from "@/data/session";
import { actions } from "@/data/store";
import { Button, Chip, Segmented, SectionTitle, SubScreen, Text, TextField } from "@/ui";

const RELATIONS = ["Conjoint", "Enfant", "Frère", "Sœur", "Mère", "Père", "Cousin", "Autre"];

/** Inviter un proche : il suit les biens de la famille, la gestion et la valeur de sa part. */
export default function InviteFamily() {
  const user = useUser();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [countryCode, setCountryCode] = useState(user.country ?? "CI");
  const [phone, setPhone] = useState("");
  const [relation, setRelation] = useState<string>();
  const [access, setAccess] = useState<"VIEW" | "MANAGE">("VIEW");
  const [done, setDone] = useState<string | null>(null);

  const country = PHONE_COUNTRIES.find((c) => c.code === countryCode) ?? PHONE_COUNTRIES[0]!;
  const e164 = toE164(country, phone);
  const ok = firstName.trim().length > 0 && !!e164 && !!relation;

  const message = () =>
    `Bonjour ${firstName.trim()}, ${user.firstName} vous invite sur Keyo pour suivre les biens de la famille : gestion, encaissements et valeur de votre part. Rejoignez-nous : https://keyo.app/f/${done ?? ""}`;

  if (done) {
    return (
      <SubScreen
        title="Invitation prête"
        footer={<Button label="Envoyer l'invitation" onPress={() => Share.share({ message: message() }).then(() => router.replace({ pathname: "/famille/[id]", params: { id: done } }))} />}
      >
        <Text variant="body" style={{ marginTop: 16 }}>
          {firstName.trim()} est ajouté{relation === "Sœur" || relation === "Mère" ? "e" : ""} à votre famille. Envoyez l'invitation par SMS ou WhatsApp.
        </Text>
        <Text variant="rowSubtitle" tone="inkMuted" style={{ marginTop: 12 }}>
          Pensez à lui attribuer des parts : ouvrez un bien de famille, puis « Modifier le bien ».
        </Text>
      </SubScreen>
    );
  }

  return (
    <SubScreen
      title="Inviter un proche"
      footer={
        <Button
          label="Ajouter à la famille"
          disabled={!ok}
          onPress={() => setDone(actions.inviteFamilyMember({ firstName: firstName.trim(), lastName: lastName.trim(), phone: e164!, relation: relation!, access }))}
        />
      }
    >
      <TextField label="Prénom" value={firstName} onChangeText={setFirstName} autoCapitalize="words" />
      <TextField label="Nom" value={lastName} onChangeText={setLastName} autoCapitalize="words" />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 16 }}>
        {PHONE_COUNTRIES.map((c) => (
          <Chip key={c.code} active={c.code === countryCode} label={c.label} onPress={() => setCountryCode(c.code)} />
        ))}
      </View>
      <TextField label="Téléphone" value={formatLocal(country, phone)} onChangeText={(t) => setPhone(t.replace(/\D/g, ""))} keyboardType="phone-pad" leading={<Text variant="rowTitle">{country.dial}</Text>} />

      <SectionTitle>Lien de parenté</SectionTitle>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
        {RELATIONS.map((r) => (
          <Chip key={r} active={r === relation} label={r} onPress={() => setRelation(r)} />
        ))}
      </View>

      <SectionTitle>Ce que ce proche peut faire</SectionTitle>
      <Segmented
        value={access}
        onChange={setAccess}
        options={[
          { value: "VIEW", label: "Consulter" },
          { value: "MANAGE", label: "Co-gérer" },
        ]}
      />
      <Text variant="rowSubtitle" tone="inkMuted">
        {access === "VIEW"
          ? "Il voit ses biens, la valeur de sa part, les encaissements, les incidents et le contrôle de gestion. Il ne peut rien modifier."
          : "Il voit tout, et peut aussi suivre les incidents et écrire aux occupants. Les décisions sur l'argent restent les vôtres."}
      </Text>
    </SubScreen>
  );
}
