import { useMemo, useState } from "react";
import { KeyboardAvoidingView, Linking, Platform, Share, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Check, MessageSquare, Share2 } from "lucide-react-native";
import { formatLocal, formatMoney, money, PHONE_COUNTRIES, toE164 } from "@keyo/shared";
import { color, radius } from "@keyo/tokens";
import { fullDate, today } from "@/data/period";
import { assetSummary } from "@/data/selectors";
import { useUser } from "@/data/session";
import { actions, useOwnerState } from "@/data/store";
import { Button, Chip, IconCircle, SubScreen, Text, TextField } from "@/ui";

const DUE_DAYS = [1, 5, 10, 15];
const DEPOSIT_MONTHS = [1, 2, 3];
const digits = (t: string) => t.replace(/\D/g, "");
const grouped = (t: string) => (t ? Number(t).toLocaleString("fr-FR").replace(/\s/g, " ") : "");

/** Inviter un locataire et créer le bail : dates, loyer, caution, échéance. L'échéancier est généré. */
export default function InviteTenant() {
  const { id, unit: unitParam } = useLocalSearchParams<{ id: string; unit?: string }>();
  const user = useUser();
  const state = useOwnerState((s) => s);
  const asset = state.assets.find((a) => a.id === id);
  const vacant = useMemo(() => (asset ? assetSummary(state, asset).vacantUnits : []), [state, asset]);
  const [unitId, setUnitId] = useState(unitParam ?? vacant[0]?.id);
  const unit = vacant.find((u) => u.id === unitId) ?? vacant[0];
  const isXof = asset?.currency !== "EUR";
  const factor = isXof ? 1 : 100;
  const asking = unit && typeof unit.details.askingRent === "number" ? unit.details.askingRent / factor : 0;

  const country = PHONE_COUNTRIES.find((c) => c.code === asset?.location.country) ?? PHONE_COUNTRIES[0];
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [start, setStart] = useState(new Date(`${today()}T12:00:00Z`));
  const [rent, setRent] = useState(asking ? String(asking) : "");
  const [depositMonths, setDepositMonths] = useState(2);
  const [dueDay, setDueDay] = useState(5);
  const [done, setDone] = useState<{ agreementId: string; code: string }>();

  if (!asset || !unit) {
    return (
      <SubScreen title="Aucun logement libre">
        <Text variant="body" tone="inkMuted" style={{ marginTop: 12 }}>
          Tous les logements de ce bien ont déjà un locataire. Ajoutez un logement depuis le menu du bien.
        </Text>
      </SubScreen>
    );
  }

  const e164 = toE164(country, phone);
  const rentMinor = Number(rent || 0) * factor;
  const ok = firstName.trim().length > 1 && !!e164 && rentMinor > 0;
  const startIso = start.toISOString().slice(0, 10);
  const currencyLabel = isXof ? "FCFA" : "€";

  const create = () => {
    if (!e164) return;
    const { agreementId } = actions.createLease({
      assetId: asset.id,
      unitId: unit.id,
      tenant: { firstName: firstName.trim(), lastName: lastName.trim(), phone: e164 },
      startDate: startIso,
      rent: money(rentMinor, asset.currency),
      deposit: money(rentMinor * depositMonths, asset.currency),
      dueDay,
    });
    setDone({ agreementId, code: agreementId.slice(-6).toUpperCase() });
  };

  if (done) {
    // Côté API : lien signé à usage unique ; le locataire peut aussi payer par lien SMS sans installer l'app.
    const link = `https://keyo.app/rejoindre/${done.code}`;
    const message = `Bonjour ${firstName.trim()}, ${user.firstName} ${user.lastName ?? ""} vous invite sur Keyo pour votre logement ${asset.name}. Loyer : ${formatMoney(money(rentMinor, asset.currency))} le ${dueDay} de chaque mois. Rejoignez votre logement : ${link}`;
    return (
      <SubScreen
        title="Invitation prête"
        onBack={() => router.back()}
        footer={<Button label="Voir le bail" onPress={() => router.replace(`/bail/${done.agreementId}`)} />}
      >
        <View style={{ marginTop: 20, padding: 20, borderRadius: radius.card, backgroundColor: color.mintTint, flexDirection: "row", gap: 14, alignItems: "center" }}>
          <IconCircle icon={Check} bg="mint" fg="onMint" />
          <Text variant="body" style={{ flex: 1 }}>
            Le bail de {firstName.trim()} est créé. Les loyers seront suivis à partir du {fullDate(startIso)}.
          </Text>
        </View>
        <Text variant="rowSubtitle" tone="inkMuted" style={{ marginTop: 24 }}>
          Message envoyé à {e164}
        </Text>
        <View style={{ marginTop: 8, padding: 18, borderRadius: radius.card, backgroundColor: color.surfaceRaised }}>
          <Text variant="body">{message}</Text>
        </View>
        <View style={{ flexDirection: "row", gap: 12, marginTop: 16 }}>
          <View style={{ flex: 1 }}>
            <Button kind="soft" icon={MessageSquare} label="SMS" onPress={() => Linking.openURL(`sms:${e164}${Platform.OS === "ios" ? "&" : "?"}body=${encodeURIComponent(message)}`)} />
          </View>
          <View style={{ flex: 1 }}>
            <Button kind="soft" icon={Share2} label="Partager" onPress={() => Share.share({ message })} />
          </View>
        </View>
      </SubScreen>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
      <SubScreen title="Inviter un locataire" subtitle={asset.name} footer={<Button label="Créer le bail et inviter" disabled={!ok} onPress={create} />}>
        {vacant.length > 1 && (
          <>
            <Text variant="rowSubtitle" tone="inkMuted" style={{ marginTop: 20 }}>
              Logement
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
              {vacant.map((u) => (
                <Chip
                  key={u.id}
                  active={u.id === unit.id}
                  label={u.label}
                  onPress={() => {
                    setUnitId(u.id);
                    if (typeof u.details.askingRent === "number") setRent(String(u.details.askingRent / factor));
                  }}
                />
              ))}
            </View>
          </>
        )}

        <Text variant="section" style={{ marginTop: 28 }}>
          Locataire
        </Text>
        <View style={{ flexDirection: "row", gap: 12 }}>
          <View style={{ flex: 1 }}>
            <TextField label="Prénom" value={firstName} onChangeText={setFirstName} autoCapitalize="words" />
          </View>
          <View style={{ flex: 1 }}>
            <TextField label="Nom" value={lastName} onChangeText={setLastName} autoCapitalize="words" />
          </View>
        </View>
        <TextField
          label="Téléphone"
          value={formatLocal(country, phone)}
          onChangeText={(t) => setPhone(digits(t))}
          keyboardType="phone-pad"
          leading={<Text variant="rowTitle">{country.dial}</Text>}
          hint="L'invitation et les rappels de paiement partent sur ce numéro."
        />

        <Text variant="section" style={{ marginTop: 28 }}>
          Bail
        </Text>
        <View style={{ marginTop: 20, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text variant="rowSubtitle" tone="inkMuted">
            Date d'entrée
          </Text>
          <DateTimePicker value={start} mode="date" display={Platform.OS === "ios" ? "compact" : "default"} locale="fr-FR" onChange={(_, d) => d && setStart(d)} accentColor={color.mintDeep} />
        </View>
        <TextField label={`Loyer mensuel (${currencyLabel})`} value={grouped(rent)} onChangeText={(t) => setRent(digits(t))} keyboardType="number-pad" />
        <Text variant="rowSubtitle" tone="inkMuted" style={{ marginTop: 20 }}>
          Caution
        </Text>
        <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
          {DEPOSIT_MONTHS.map((m) => (
            <Chip key={m} active={m === depositMonths} label={`${m} mois`} onPress={() => setDepositMonths(m)} />
          ))}
        </View>
        {rentMinor > 0 && (
          <Text variant="caption" tone="inkMuted" style={{ marginTop: 8 }}>
            Soit {formatMoney(money(rentMinor * depositMonths, asset.currency))}.
          </Text>
        )}
        <Text variant="rowSubtitle" tone="inkMuted" style={{ marginTop: 20 }}>
          Jour d'échéance
        </Text>
        <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
          {DUE_DAYS.map((d) => (
            <Chip key={d} active={d === dueDay} label={`Le ${d}`} onPress={() => setDueDay(d)} />
          ))}
        </View>
        <Text variant="caption" tone="inkMuted" style={{ marginTop: 8 }}>
          En cas de retard, relances automatiques à J+1, J+5 et J+10.
        </Text>
      </SubScreen>
    </KeyboardAvoidingView>
  );
}
