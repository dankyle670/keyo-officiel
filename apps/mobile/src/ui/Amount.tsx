import { View } from "react-native";
import { currencyLabel, formatAmount, type Money } from "@keyo/shared";
import type { ColorToken, TypeToken } from "@keyo/tokens";
import { Text } from "./Text";

type Props = {
  value: Money;
  variant?: TypeToken;
  tone?: ColorToken;
  currencyTone?: ColorToken;
  /** Masque la devise (ex. colonnes où elle est déjà indiquée). */
  hideCurrency?: boolean;
};

/** Montant en chiffres tabulaires ; la devise plus petite et en gris (« 450 000 FCFA »). */
export function Amount({ value, variant = "rowTitle", tone = "ink", currencyTone = "inkMuted", hideCurrency }: Props) {
  const big = variant === "amount" || variant === "display";
  return (
    <View style={{ flexDirection: "row", alignItems: "baseline", gap: big ? 8 : 4 }}>
      <Text variant={variant} tone={tone} tabular>
        {formatAmount(value)}
      </Text>
      {!hideCurrency && (
        <Text variant={big ? "heading" : "caption"} tone={currencyTone} style={{ fontSize: big ? 18 : 11 }}>
          {currencyLabel(value.currency)}
        </Text>
      )}
    </View>
  );
}

/** Montants empilés, un par devise (le patrimoine ne convertit jamais implicitement). */
export function AmountList({ values, variant = "rowTitle" }: { values: Money[]; variant?: TypeToken }) {
  if (!values.length)
    return (
      <Text variant="rowSubtitle" tone="inkMuted">
        –
      </Text>
    );
  return (
    <View style={{ alignItems: "flex-end" }}>
      {values.map((m) => (
        <Amount key={m.currency} value={m} variant={variant} />
      ))}
    </View>
  );
}
