import type { ReactNode } from "react";
import { ScrollView, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChevronLeft } from "lucide-react-native";
import { color } from "@keyo/tokens";
import { RoundButton } from "./RoundButton";
import { Text } from "./Text";

type Props = { title: string; subtitle?: string; right?: ReactNode; children: ReactNode; footer?: ReactNode; onBack?: () => void };

/** Écran secondaire : bouton retour, grand titre, contenu défilant, pied fixe optionnel (bouton principal). */
export function SubScreen({ title, subtitle, right, children, footer, onBack }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: color.surface }}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingTop: insets.top + 8, paddingHorizontal: 24, paddingBottom: footer ? 120 + insets.bottom : 32 + insets.bottom }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <RoundButton icon={ChevronLeft} label="Retour" onPress={onBack ?? (() => (router.canGoBack() ? router.back() : router.replace("/")))} />
          {right}
        </View>
        <Text variant="screenTitle" accessibilityRole="header" style={{ marginTop: 18 }}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="rowSubtitle" tone="inkMuted" style={{ marginTop: 6 }}>
            {subtitle}
          </Text>
        ) : null}
        {children}
      </ScrollView>
      {footer ? <View style={{ position: "absolute", left: 24, right: 24, bottom: insets.bottom + 16 }}>{footer}</View> : null}
    </View>
  );
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <View style={{ marginTop: 32, gap: 8 }}>
      <Text variant="heading">{title}</Text>
      <Text variant="body" tone="inkMuted">
        {body}
      </Text>
      {action ? <View style={{ marginTop: 16 }}>{action}</View> : null}
    </View>
  );
}
