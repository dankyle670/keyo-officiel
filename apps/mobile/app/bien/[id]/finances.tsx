import { useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { ArrowDownLeft, ArrowUpRight, ChevronLeft, ChevronRight, Plus } from "lucide-react-native";
import { formatAmount } from "@keyo/shared";
import { color, radius } from "@keyo/tokens";
import { dayMonth, today } from "@/data/period";
import { yearFinance } from "@/data/selectors";
import { useOwnerState } from "@/data/store";
import { Amount, Button, IconCircle, ListRow, SectionTitle, SubScreen, Text } from "@/ui";

const CATEGORY_LABEL: Record<string, string> = { RENT: "Loyer", REPAIR: "Travaux", MAINTENANCE: "Entretien", TAX: "Impôts et taxes", INSURANCE: "Assurance", FEES: "Charges", OTHER: "Autre" };

/** Finances d'un bien : revenus, dépenses, net de l'année, mois par mois. */
export default function Finances() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const state = useOwnerState((s) => s);
  const asset = state.assets.find((a) => a.id === id);
  const thisYear = Number(today().slice(0, 4));
  const [year, setYear] = useState(thisYear);
  const f = useMemo(() => (asset ? yearFinance(state, asset.id, year, asset.currency) : null), [state, asset, year]);
  if (!asset || !f) return <SubScreen title="Finances">{null}</SubScreen>;

  const months = year === thisYear ? f.byMonth.slice(0, Number(today().slice(5, 7))) : f.byMonth;
  const max = Math.max(1, ...months.map((v) => Math.abs(v)));
  const tx = [...f.transactions].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));

  return (
    <SubScreen
      title="Finances"
      subtitle={asset.name}
      footer={<Button label="Ajouter une dépense" icon={Plus} onPress={() => router.push({ pathname: "/bien/[id]/depense", params: { id: asset.id } })} />}
    >
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 18 }}>
        <Pressable onPress={() => setYear(year - 1)} accessibilityLabel="Année précédente" hitSlop={10}>
          <ChevronLeft size={24} strokeWidth={1.8} color={color.ink} />
        </Pressable>
        <Text variant="heading">{year}</Text>
        <Pressable onPress={() => setYear(Math.min(thisYear, year + 1))} disabled={year >= thisYear} accessibilityLabel="Année suivante" hitSlop={10} style={{ opacity: year >= thisYear ? 0.3 : 1 }}>
          <ChevronRight size={24} strokeWidth={1.8} color={color.ink} />
        </Pressable>
      </View>

      <View style={{ marginTop: 16, padding: 20, borderRadius: radius.card, backgroundColor: color.night, gap: 6 }}>
        <Text variant="rowSubtitle" style={{ color: "#B8C3D6" }}>
          Revenu net {year === thisYear ? "depuis janvier" : `en ${year}`}
        </Text>
        <Amount value={f.net} variant="amount" tone="onNight" currencyTone="onNight" />
        <View style={{ flexDirection: "row", gap: 20, marginTop: 6 }}>
          <Text variant="rowSubtitle" tone="mint">
            + {formatAmount(f.income)} reçus
          </Text>
          <Text variant="rowSubtitle" style={{ color: "#F9B27A" }}>
            − {formatAmount(f.expenses)} dépensés
          </Text>
        </View>
      </View>

      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 6, height: 110, marginTop: 20 }} accessibilityLabel="Revenu net par mois">
        {months.map((v, i) => (
          <View key={i} style={{ flex: 1, alignItems: "center", gap: 4 }}>
            <View style={{ width: "100%", height: Math.max(4, (Math.abs(v) / max) * 86), borderRadius: 6, backgroundColor: v < 0 ? color.danger : v < max ? color.dotLate : color.mint }} />
            <Text variant="caption" tone="inkMuted" style={{ fontSize: 10, lineHeight: 12 }}>
              {"JFMAMJJASOND"[i]}
            </Text>
          </View>
        ))}
      </View>

      <SectionTitle>Opérations</SectionTitle>
      {tx.length === 0 && (
        <Text variant="rowSubtitle" tone="inkMuted">
          Aucune opération en {year}.
        </Text>
      )}
      {tx.map((t, i) => (
        <ListRow
          key={t.id}
          divider={i > 0}
          leading={<IconCircle icon={t.direction === "IN" ? ArrowDownLeft : ArrowUpRight} bg={t.direction === "IN" ? "mintTint" : "dangerTint"} fg={t.direction === "IN" ? "mintDeep" : "danger"} />}
          title={t.label}
          subtitle={`${CATEGORY_LABEL[t.category] ?? t.category}, ${dayMonth(t.occurredAt)}${t.confirmedBy === "WEBHOOK" ? ", confirmé par l'opérateur" : ""}`}
          trailing={<Amount value={{ ...t.amount, amount: t.direction === "IN" ? t.amount.amount : -t.amount.amount }} variant="rowTitle" tone={t.direction === "IN" ? "mintDeep" : "ink"} />}
        />
      ))}
    </SubScreen>
  );
}
