import { useMemo } from "react";
import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { Building2, CalendarClock, FileText, Landmark, Layers, ShieldCheck, Wallet } from "lucide-react-native";
import { borrowingCapacity, formatMoney, PASSPORT_LEVEL_LABEL } from "@keyo/shared";
import { color, radius } from "@keyo/tokens";
import { today } from "@/data/period";
import { passportOf, shareStatus } from "@/data/selectors";
import { useUser } from "@/data/session";
import { useOwnerState } from "@/data/store";
import { Amount, Button, IconCircle, ListRow, ScoreGauge, SectionTitle, Status, SubScreen, Text } from "@/ui";

const PART_ICON = { COLLECTION: Wallet, OCCUPANCY: Building2, TRACK_RECORD: CalendarClock, COMPLIANCE: ShieldCheck, DIVERSITY: Layers } as const;

/**
 * Passeport propriétaire : profil financier certifié par Keyo (loyers encaissés, occupation,
 * patrimoine), capacité d'emprunt indicative et partage avec une banque ou une microfinance.
 */
export default function OwnerPassportScreen() {
  const user = useUser();
  const state = useOwnerState((s) => s);
  const p = useMemo(() => passportOf(state, user.id, user.displayCurrency, today()), [state, user.id, user.displayCurrency]);
  const credit = useMemo(
    () => borrowingCapacity({ passport: p, otherIncome: state.passport.otherIncome ?? 0, existingLoans: state.passport.existingLoans ?? 0, years: 15 }),
    [p, state.passport.otherIncome, state.passport.existingLoans],
  );
  const active = state.passport.shares.filter((x) => shareStatus(x) === "ACTIVE");
  const pct = (permille: number) => `${(permille / 10).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %`;

  return (
    <SubScreen
      title="Passeport propriétaire"
      right={
        <Pressable onPress={() => router.push("/passeport/attestation")} accessibilityRole="button" accessibilityLabel="Attestation" hitSlop={8} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: color.surfaceRaised, alignItems: "center", justifyContent: "center" }}>
          <FileText size={22} strokeWidth={1.8} color={color.ink} />
        </Pressable>
      }
      footer={<Button icon={Landmark} label="Partager avec une banque" onPress={() => router.push("/passeport/partage")} />}
    >
      <View style={{ marginTop: 16, paddingVertical: 24, borderRadius: radius.card, backgroundColor: color.night, alignItems: "center", gap: 4 }}>
        <ScoreGauge score={p.score} label={PASSPORT_LEVEL_LABEL[p.level]} />
        <Text variant="rowSubtitle" tone="track">
          Score Keyo propriétaire sur 1000
        </Text>
      </View>

      {p.parts.map((part, i) => {
        const Icon = PART_ICON[part.key];
        return (
          <ListRow
            key={part.key}
            divider={i > 0}
            leading={<IconCircle icon={Icon} bg="mintTint" fg="mintDeep" />}
            title={part.label}
            subtitle={part.detail}
            trailing={
              <Text variant="rowTitle" tabular>
                {`${part.points}/${part.max}`}
              </Text>
            }
          />
        );
      })}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10 }}>
        <ShieldCheck size={16} strokeWidth={1.8} color={color.mintDeep} />
        <Text variant="caption" tone="inkMuted" style={{ flex: 1 }}>
          Seuls les loyers encaissés avec Keyo et confirmés par l'opérateur de paiement sont certifiés.
        </Text>
      </View>

      <SectionTitle>Revenus certifiés, 12 derniers mois</SectionTitle>
      <View style={{ padding: 20, borderRadius: radius.card, backgroundColor: color.surfaceRaised, gap: 12 }}>
        <Row label="Loyers encaissés" value={<Amount value={p.certifiedIncome12m} />} />
        <Row label="Moyenne mensuelle" value={<Amount value={p.monthlyCertifiedIncome} />} />
        <Row label="Taux d'encaissement" value={<Text variant="rowTitle">{p.expected12m.amount ? pct(p.collectionRatePermille) : "–"}</Text>} />
        <Row label="Dépenses" value={<Amount value={p.expenses12m} />} />
        <Row label="Net mensuel moyen" value={<Amount value={p.monthlyNet} />} />
        <Row label="Loyers des baux en cours" value={<Amount value={p.currentMonthlyRent} />} />
        <Row label="Votre patrimoine" value={<Amount value={p.patrimony} />} />
      </View>
      {p.otherCurrencyAssets > 0 && (
        <Text variant="caption" tone="inkMuted" style={{ marginTop: 8 }}>
          {`${p.otherCurrencyAssets} bien${p.otherCurrencyAssets > 1 ? "s" : ""} dans une autre devise ne ${p.otherCurrencyAssets > 1 ? "sont" : "est"} pas compté${p.otherCurrencyAssets > 1 ? "s" : ""}. Changez la devise d'affichage dans Préférences pour ${p.otherCurrencyAssets > 1 ? "les" : "le"} voir.`}
        </Text>
      )}

      <SectionTitle>Capacité d'emprunt</SectionTitle>
      <Pressable
        onPress={() => router.push("/passeport/credit")}
        accessibilityRole="button"
        style={({ pressed }) => ({ padding: 20, borderRadius: radius.card, backgroundColor: color.mintTint, gap: 6, opacity: pressed ? 0.8 : 1 })}
      >
        <Text variant="rowSubtitle" tone="mintDeep">
          {`Sur 15 ans, à ${pct(credit.ratePermille)}, estimation indicative`}
        </Text>
        <Amount value={credit.capacity} variant="amount" />
        <Text variant="rowSubtitle" tone="inkMuted">
          {`Mensualité jusqu'à ${formatMoney(credit.maxInstallment)}. ${state.passport.otherIncome ? "" : "Ajoutez vos autres revenus pour un calcul complet. "}Simuler un crédit`}
        </Text>
      </Pressable>

      <SectionTitle>Partages</SectionTitle>
      {state.passport.shares.length === 0 ? (
        <Text variant="rowSubtitle" tone="inkMuted">
          Votre passeport n'est partagé avec personne. Vous choisissez l'établissement, ce qu'il voit et pendant combien de temps.
        </Text>
      ) : (
        <ListRow
          divider={false}
          leading={<IconCircle icon={Landmark} />}
          title={active.length ? `${active.length} partage${active.length > 1 ? "s" : ""} actif${active.length > 1 ? "s" : ""}` : "Aucun partage actif"}
          subtitle={state.passport.shares.map((x) => x.institution).join(", ")}
          trailing={<Status tone={active.length ? "paid" : "neutral"} label={active.length ? "Actif" : "Terminé"} />}
          onPress={() => router.push("/passeport/partage")}
        />
      )}
    </SubScreen>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
      <Text variant="rowSubtitle" tone="inkMuted">
        {label}
      </Text>
      {value}
    </View>
  );
}
