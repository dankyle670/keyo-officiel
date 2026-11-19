import { useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { View } from "react-native";
import { cap, MINOR_UNITS, profileOf } from "@keyo/shared";
import { fullDate, today } from "@/data/period";
import { leaseView } from "@/data/selectors";
import { actions, useOwnerState } from "@/data/store";
import { Button, Chip, SectionTitle, SubScreen, Text, TextField } from "@/ui";

const digits = (t: string) => t.replace(/\D/g, "");
const grouped = (t: string) => (t ? Number(t).toLocaleString("fr-FR").replace(/\s/g, " ") : "");
const DUE_DAYS = [1, 5, 10, 15, 25];
const iso = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Modifier un contrat : montant, caution, échéance, durée et occupant. Les échéances à venir
 * non payées sont recalculées ; le passé et les sommes reçues ne changent pas.
 */
export default function EditLease() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const state = useOwnerState((s) => s);
  const view = leaseView(state, id);
  const g = view?.agreement;
  const factor = 10 ** MINOR_UNITS[g?.periodicAmount.currency ?? "XOF"];

  const [amount, setAmount] = useState(g ? String(g.periodicAmount.amount / factor) : "");
  const [deposit, setDeposit] = useState(g?.deposit ? String(g.deposit.amount / factor) : "");
  const [dueDay, setDueDay] = useState(g?.dueDay ?? 5);
  const [endDate, setEndDate] = useState<string | null>(g?.endDate ?? null);
  const [first, setFirst] = useState(view?.party?.firstName ?? "");
  const [last, setLast] = useState(view?.party?.lastName ?? "");
  const [phone, setPhone] = useState(view?.party?.phone ?? "");

  if (!view || !g || !view.asset || !view.party) {
    return (
      <SubScreen title="Contrat introuvable">
        <Text variant="body" tone="inkMuted">
          Ce contrat n'existe plus sur ce téléphone.
        </Text>
      </SubScreen>
    );
  }
  const profile = profileOf(view.asset.type);
  const c = g.periodicAmount.currency;
  const currencyLabel = c === "XOF" ? "FCFA" : c === "EUR" ? "€" : c;
  const ok = Number(amount) > 0 && first.trim().length > 0;
  const base = new Date(`${g.startDate}T12:00:00`);
  const durations = [
    { label: "Sans fin", value: null },
    ...[1, 2, 3].map((y) => {
      const d = new Date(base);
      d.setFullYear(d.getFullYear() + y);
      d.setDate(d.getDate() - 1);
      return { label: `${y} an${y > 1 ? "s" : ""}`, value: iso(d) };
    }),
  ].filter((o) => !o.value || o.value >= today());

  const save = () => {
    actions.updateLease(g.id, { amount: Number(amount) * factor, deposit: deposit ? Number(deposit) * factor : 0, dueDay, endDate });
    actions.updateParty(view.party!.id, { firstName: first.trim(), lastName: last.trim(), phone: phone.trim() });
    router.back();
  };

  return (
    <SubScreen title="Modifier le contrat" subtitle={view.asset.name} footer={<Button label="Enregistrer" disabled={!ok} onPress={save} />}>
      <SectionTitle>Conditions</SectionTitle>
      <TextField label={`${cap(profile.amount)} mensuel (${currencyLabel})`} value={grouped(amount)} onChangeText={(t) => setAmount(digits(t))} keyboardType="number-pad" hint="S'applique aux prochaines échéances non payées." />
      <TextField label={`Caution (${currencyLabel})`} value={grouped(deposit)} onChangeText={(t) => setDeposit(digits(t))} keyboardType="number-pad" />
      <Text variant="rowSubtitle" tone="inkMuted" style={{ marginTop: 18 }}>
        Jour d'échéance
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
        {DUE_DAYS.map((d) => (
          <Chip key={d} active={d === dueDay} label={`Le ${d}`} onPress={() => setDueDay(d)} />
        ))}
      </View>
      <Text variant="rowSubtitle" tone="inkMuted" style={{ marginTop: 18 }}>
        Durée
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
        {durations.map((o) => (
          <Chip key={o.label} active={o.value === endDate} label={o.label} onPress={() => setEndDate(o.value)} />
        ))}
      </View>
      {endDate && (
        <Text variant="caption" tone="inkMuted" style={{ marginTop: 8 }}>
          Fin le {fullDate(endDate)}.
        </Text>
      )}

      <SectionTitle>{cap(profile.occupant.one)}</SectionTitle>
      <TextField label="Prénom" value={first} onChangeText={setFirst} autoCapitalize="words" />
      <TextField label="Nom" value={last} onChangeText={setLast} autoCapitalize="words" />
      <TextField label="Téléphone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
    </SubScreen>
  );
}
