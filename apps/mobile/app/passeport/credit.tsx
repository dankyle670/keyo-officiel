import { useMemo, useState } from "react";
import { View } from "react-native";
import { borrowingCapacity, currencyLabel, formatMoney, MINOR_UNITS } from "@keyo/shared";
import { color, radius } from "@keyo/tokens";
import { today } from "@/data/period";
import { passportOf } from "@/data/selectors";
import { useUser } from "@/data/session";
import { actions, useOwnerState } from "@/data/store";
import { Amount, Chip, SectionTitle, SubScreen, Text, TextField } from "@/ui";

const YEARS = [5, 10, 15, 20, 25];
const digits = (t: string) => t.replace(/\D/g, "");
const grouped = (t: string) => (t ? Number(t).toLocaleString("fr-FR").replace(/\s/g, " ") : "");

/**
 * Simulation de crédit, comme la ferait une banque : loyers certifiés retenus à 70 %, autres
 * revenus déclarés, crédits en cours, endettement plafonné. Indicatif, sans valeur d'offre.
 */
export default function CreditSimulation() {
  const user = useUser();
  const state = useOwnerState((s) => s);
  const c = user.displayCurrency;
  const factor = 10 ** MINOR_UNITS[c];
  const p = useMemo(() => passportOf(state, user.id, c, today()), [state, user.id, c]);

  const [other, setOther] = useState(state.passport.otherIncome ? String(state.passport.otherIncome / factor) : "");
  const [loans, setLoans] = useState(state.passport.existingLoans ? String(state.passport.existingLoans / factor) : "");
  const [project, setProject] = useState("");
  const [years, setYears] = useState(15);
  const [rate, setRate] = useState("");

  const ratePermille = rate ? Math.round(Number(rate.replace(",", ".")) * 10) : undefined;
  const b = borrowingCapacity({
    passport: p,
    otherIncome: Number(other || 0) * factor,
    existingLoans: Number(loans || 0) * factor,
    projectRent: Number(project || 0) * factor,
    years,
    ratePermille: ratePermille && ratePermille > 0 ? ratePermille : undefined,
  });
  const pct = (permille: number) => `${(permille / 10).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %`;
  const cl = currencyLabel(c);
  const persist = () => actions.setPassportDeclared({ otherIncome: Number(other || 0) * factor, existingLoans: Number(loans || 0) * factor });

  return (
    <SubScreen title="Simuler un crédit" subtitle="Estimation indicative">
      <View style={{ marginTop: 16, padding: 22, borderRadius: radius.card, backgroundColor: color.night, gap: 6 }}>
        <Text variant="rowSubtitle" tone="track">
          {`Vous pourriez emprunter jusqu'à, sur ${years} ans`}
        </Text>
        <Amount value={b.capacity} variant="display" tone="onNight" currencyTone="track" />
        <Text variant="rowSubtitle" tone="track">
          {`Mensualité maximale ${formatMoney(b.maxInstallment)}, taux ${pct(b.ratePermille)}`}
        </Text>
      </View>

      <SectionTitle>Durée</SectionTitle>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {YEARS.map((y) => (
          <Chip key={y} active={y === years} label={`${y} ans`} onPress={() => setYears(y)} />
        ))}
      </View>

      <SectionTitle>Vos revenus</SectionTitle>
      <View style={{ padding: 16, borderRadius: radius.card, backgroundColor: color.surfaceRaised, gap: 8 }}>
        <Row label="Loyers certifiés par Keyo (par mois)" value={<Amount value={p.monthlyCertifiedIncome} />} />
        <Row label="Loyers des baux en cours" value={<Amount value={p.currentMonthlyRent} />} />
        <Text variant="caption" tone="inkMuted">
          {`La banque retient en général ${pct(b.rentRetainedPermille)} des loyers, sur le plus prudent des deux montants.`}
        </Text>
      </View>
      <TextField label={`Autres revenus nets par mois (${cl}), déclarés`} value={grouped(other)} onChangeText={(t) => setOther(digits(t))} onBlur={persist} keyboardType="number-pad" hint="Salaire, pension, activité. Non vérifié par Keyo." />
      <TextField label={`Crédits en cours, mensualités (${cl})`} value={grouped(loans)} onChangeText={(t) => setLoans(digits(t))} onBlur={persist} keyboardType="number-pad" />
      <TextField label={`Loyer attendu du bien à financer (${cl}), facultatif`} value={grouped(project)} onChangeText={(t) => setProject(digits(t))} keyboardType="number-pad" hint="Si vous achetez pour louer, la banque peut en tenir compte." />
      <TextField label="Taux annuel (%), facultatif" value={rate} onChangeText={(t) => setRate(t.replace(/[^\d,]/g, ""))} keyboardType="decimal-pad" placeholder={pct(b.ratePermille).replace(" %", "")} hint="Laissez vide pour le repère du marché." />

      <SectionTitle>Le calcul</SectionTitle>
      <View style={{ padding: 16, borderRadius: radius.card, backgroundColor: color.surfaceRaised, gap: 8 }}>
        <Row label="Revenus retenus" value={<Amount value={b.retainedIncome} />} />
        <Row label="Endettement maximal" value={<Text variant="rowTitle">{pct(b.maxDebtPermille)}</Text>} />
        <Row label="Endettement actuel" value={<Text variant="rowTitle" tone={b.currentDebtPermille > b.maxDebtPermille ? "danger" : "ink"}>{pct(b.currentDebtPermille)}</Text>} />
        <Row label="Mensualité disponible" value={<Amount value={b.maxInstallment} />} />
      </View>

      <Text variant="caption" tone="inkMuted" style={{ marginTop: 20 }}>
        Simulation indicative à partir de repères de marché. Ce n'est pas une offre de prêt : la décision, le taux et le montant appartiennent à la banque ou à la microfinance, qui étudiera aussi votre apport, vos garanties et votre situation.
      </Text>
    </SubScreen>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
      <Text variant="rowSubtitle" tone="inkMuted" style={{ flex: 1 }}>
        {label}
      </Text>
      {value}
    </View>
  );
}
