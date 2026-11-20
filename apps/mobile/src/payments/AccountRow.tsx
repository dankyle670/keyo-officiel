import { Pressable, View } from "react-native";
import { ChevronRight, Landmark, Smartphone } from "lucide-react-native";
import { PAYMENT_ACCOUNT_STATUS_LABEL, type PaymentAccountView } from "@keyo/shared";
import { color } from "@keyo/tokens";
import { IconCircle, Status, Text } from "@/ui";

const TONE = { VERIFIED: "paid", PENDING: "late", REJECTED: "danger" } as const;

/** Ligne d'un compte : opérateur ou banque, numéro masqué, usage, état (point + mot). */
export function AccountRow({ account: a, detail, onPress }: { account: PaymentAccountView; detail: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 14, minHeight: 72, paddingVertical: 12, opacity: pressed ? 0.6 : 1 })}>
      <IconCircle icon={a.kind === "BANK" ? Landmark : Smartphone} bg="mintTint" fg="mintDeep" diameter={40} />
      <View style={{ flex: 1, gap: 3 }}>
        <Text variant="rowTitle" style={{ fontVariant: ["tabular-nums"] }}>
          {a.label} {a.masked}
        </Text>
        <Text variant="caption" tone="inkMuted" numberOfLines={1}>
          {detail}
        </Text>
        <Status tone={TONE[a.status]} label={PAYMENT_ACCOUNT_STATUS_LABEL[a.status]} />
      </View>
      <ChevronRight size={20} strokeWidth={1.8} color={color.inkMuted} />
    </Pressable>
  );
}
