import { useState } from "react";
import { View } from "react-native";
import { Check } from "lucide-react-native";
import { CUSTOM_FROM_UNITS, formatMoney, PLANS, YEARLY_MONTHS_BILLED } from "@keyo/shared";
import { color, radius } from "@keyo/tokens";
import { billingApi, BillingApiError } from "@/billing/api";
import { useOwnerState } from "@/data/store";
import { Segmented, Status, SubScreen, Text } from "@/ui";

/** Les formules Keyo. La formule n'est pas choisie : elle suit le nombre de logements gérés. */
export default function Plans() {
  const sub = useOwnerState((s) => s.subscription);
  const currency = sub?.currency ?? "XOF";
  const current = sub?.plan?.id;
  const [error, setError] = useState<string>();
  const setPeriod = (p: "MONTHLY" | "YEARLY") => billingApi.setPeriod(p).then(() => setError(undefined), (e) => setError(e instanceof BillingApiError ? e.message : "Changement impossible."));
  return (
    <SubScreen title="Formules et facturation" subtitle="Un prix fixe selon le nombre de logements, jamais un pourcentage de vos loyers. Sans engagement.">
      {sub && sub.status !== "CANCELED" ? (
        <View style={{ marginTop: 20, gap: 8 }}>
          <Segmented
            value={sub.period}
            options={[
              { value: "MONTHLY", label: "Mensuelle" },
              { value: "YEARLY", label: "Annuelle, 2 mois offerts" },
            ]}
            onChange={setPeriod}
          />
          <Text variant="caption" tone="inkMuted">
            Appliqué à la prochaine échéance.
          </Text>
          {error ? (
            <Text variant="rowSubtitle" tone="danger">
              {error}
            </Text>
          ) : null}
        </View>
      ) : null}
      {sub?.savings && sub.savings.saved.amount > 0 ? (
        <Text variant="body" tone="inkMuted" style={{ marginTop: 16 }}>
          {`Une agence à 10 % vous prendrait ${formatMoney(sub.savings.agency)} par mois sur vos loyers actuels.`}
        </Text>
      ) : null}
      <View style={{ gap: 12, marginTop: 20 }}>
        {PLANS.map((p) => {
          const active = p.id === current;
          return (
            <View key={p.id} style={{ padding: 20, borderRadius: radius.card, backgroundColor: active ? color.night : color.surfaceRaised, gap: 8 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text variant="heading" tone={active ? "onNight" : "ink"}>
                  {p.name}
                </Text>
                {active ? (
                  <View style={{ backgroundColor: color.surfaceRaised, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
                    <Status tone="paid" label="Votre formule" />
                  </View>
                ) : null}
              </View>
              <Text variant="title" tone={active ? "onNight" : "ink"}>
                {`${formatMoney({ amount: p.monthly[currency], currency })} par mois`}
              </Text>
              <Text variant="rowSubtitle" tone={active ? "track" : "inkMuted"}>
                {`${p.minUnits} à ${p.maxUnits} logements · ou ${formatMoney({ amount: p.monthly[currency] * YEARLY_MONTHS_BILLED, currency })} par an`}
              </Text>
              {["Agent Keyo sans limite pour suivre et gérer", `${p.expertIncluded} analyses d'expert par mois (expertise, contrat, fiscalité)`, "Relances, quittances, incidents, rapports"].map((f) => (
                <View key={f} style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
                  <Check size={18} strokeWidth={1.8} color={active ? color.mint : color.mintDeep} />
                  <Text variant="body" tone={active ? "onNight" : "ink"}>
                    {f}
                  </Text>
                </View>
              ))}
            </View>
          );
        })}
        <View style={{ padding: 20, borderRadius: radius.card, backgroundColor: color.surfaceRaised, gap: 6 }}>
          <Text variant="heading">Sur mesure</Text>
          <Text variant="rowSubtitle" tone="inkMuted">
            {`À partir de ${CUSTOM_FROM_UNITS} logements : DK Group vous propose un tarif adapté.`}
          </Text>
        </View>
        <Text variant="caption" tone="inkMuted">
          Prix TTC. La formule suit le nombre de logements : elle change à la prochaine échéance, et Keyo vous prévient avant. Au-delà des analyses d'expert comprises, 1 000 FCFA par analyse, toujours avec votre accord.
        </Text>
      </View>
    </SubScreen>
  );
}
