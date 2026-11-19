import { useState } from "react";
import { Pressable, View } from "react-native";
import { Check, ChevronDown } from "lucide-react-native";
import { CURRENCIES, currencyLabel, type Currency } from "@keyo/shared";
import { color, size } from "@keyo/tokens";
import { Sheet } from "./Sheet";
import { Text } from "./Text";

export const CURRENCY_NAME: Record<Currency, string> = {
  XOF: "Franc CFA",
  EUR: "Euro",
  CAD: "Dollar canadien",
  USD: "Dollar américain",
};

const CURRENCY_HINT: Record<Currency, string> = {
  XOF: "Côte d'Ivoire et zone UEMOA",
  EUR: "France et zone euro",
  CAD: "Canada",
  USD: "États-Unis",
};

/** Sélecteur de devise : champ en pilule qui ouvre la liste dans une feuille du bas. */
export function CurrencySelect({ label = "Devise d'affichage", value, onChange }: { label?: string; value: Currency; onChange: (c: Currency) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={{ marginTop: 20, gap: 8 }}>
      <Text variant="rowSubtitle" tone="inkMuted">
        {label}
      </Text>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`${label} : ${CURRENCY_NAME[value]}. Modifier`}
        style={({ pressed }) => ({
          height: size.button,
          borderRadius: 999,
          backgroundColor: color.surfaceRaised,
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 20,
          gap: 12,
          opacity: pressed ? 0.7 : 1,
        })}
      >
        <CurrencyBadge currency={value} />
        <Text variant="rowTitle" style={{ flex: 1 }} numberOfLines={1}>
          {CURRENCY_NAME[value]}
        </Text>
        <ChevronDown size={20} strokeWidth={1.8} color={color.inkMuted} />
      </Pressable>

      <Sheet visible={open} onClose={() => setOpen(false)} title={label}>
        {CURRENCIES.map((c, i) => {
          const active = c === value;
          return (
            <Pressable
              key={c}
              onPress={() => {
                onChange(c);
                setOpen(false);
              }}
              accessibilityRole="radio"
              accessibilityState={{ checked: active }}
              style={({ pressed }) => ({
                flexDirection: "row",
                alignItems: "center",
                gap: 14,
                paddingVertical: 14,
                borderTopWidth: i > 0 ? 1 : 0,
                borderTopColor: color.line,
                opacity: pressed ? 0.6 : 1,
              })}
            >
              <CurrencyBadge currency={c} />
              <View style={{ flex: 1 }}>
                <Text variant="rowTitle">{CURRENCY_NAME[c]}</Text>
                <Text variant="rowSubtitle" tone="inkMuted">
                  {CURRENCY_HINT[c]}
                </Text>
              </View>
              {active && <Check size={22} strokeWidth={2} color={color.mintDeep} />}
            </Pressable>
          );
        })}
      </Sheet>
    </View>
  );
}

function CurrencyBadge({ currency }: { currency: Currency }) {
  return (
    <View style={{ minWidth: 52, height: 32, borderRadius: 999, backgroundColor: color.mintTint, alignItems: "center", justifyContent: "center", paddingHorizontal: 8 }}>
      <Text variant="status" tone="mintDeep">
        {currencyLabel(currency)}
      </Text>
    </View>
  );
}
