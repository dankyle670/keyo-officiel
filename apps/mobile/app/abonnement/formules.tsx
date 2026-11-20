import { View } from "react-native";
import { Check } from "lucide-react-native";
import { CUSTOM_FROM_UNITS, formatMoney, PLANS, YEARLY_MONTHS_BILLED } from "@keyo/shared";
import { color, radius } from "@keyo/tokens";
import { useOwnerState } from "@/data/store";
import { Status, SubScreen, Text } from "@/ui";

/** Les formules Keyo. La formule n'est pas choisie : elle suit le nombre de logements gérés. */
export default function Plans() {
  const sub = useOwnerState((s) => s.subscription);
  const currency = sub?.currency ?? "XOF";
  const current = sub?.plan?.id;
  return (
    <SubScreen title="Les formules" subtitle="Un prix fixe selon le nombre de logements, jamais un pourcentage de vos loyers. Sans engagement, 30 jours d'essai gratuit.">
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
              {["Agent Keyo sans limite pour suivre et gérer", `${p.expertIncluded} analyses d'expert par mois`, "Relances, quittances, incidents, rapports"].map((f) => (
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
          Prix TTC. Ajouter ou retirer des logements change la formule à la prochaine échéance ; Keyo vous prévient avant.
        </Text>
      </View>
    </SubScreen>
  );
}
