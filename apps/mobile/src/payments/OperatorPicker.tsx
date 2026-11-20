import { Pressable, View } from "react-native";
import { MOBILE_MONEY_OPERATORS, OPERATOR_LABEL, type MobileMoneyOperator } from "@keyo/shared";
import { color, fontFamily } from "@keyo/tokens";
import { Text } from "@/ui";

/** Choix de l'opérateur Mobile Money (Wave, Orange, MTN, Moov). */
export function OperatorPicker({ value, onChange }: { value: MobileMoneyOperator; onChange: (o: MobileMoneyOperator) => void }) {
  return (
    <>
      <Text variant="rowSubtitle" tone="inkMuted" style={{ marginTop: 16 }}>
        Opérateur
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 }} accessibilityRole="radiogroup">
        {MOBILE_MONEY_OPERATORS.map((o) => {
          const active = o === value;
          return (
            <Pressable
              key={o}
              onPress={() => onChange(o)}
              accessibilityRole="radio"
              accessibilityState={{ checked: active }}
              style={{ height: 44, paddingHorizontal: 18, borderRadius: 999, justifyContent: "center", backgroundColor: active ? color.night : color.surfaceRaised }}
            >
              <Text variant="rowTitle" tone={active ? "onNight" : "ink"} style={{ fontFamily: fontFamily.semibold }}>
                {OPERATOR_LABEL[o]}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </>
  );
}
