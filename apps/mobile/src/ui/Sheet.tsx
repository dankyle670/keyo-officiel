import type { ReactNode } from "react";
import { Modal, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { color, radius } from "@keyo/tokens";
import { Text } from "./Text";

/** Feuille qui monte du bas de l'écran (choix du mois, actions d'un bien…). */
export function Sheet({ visible, onClose, title, children }: { visible: boolean; onClose: () => void; title?: string; children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: color.scrim }} onPress={onClose} accessibilityLabel="Fermer" />
      <View
        style={{
          backgroundColor: color.surface,
          borderTopLeftRadius: radius.sheet,
          borderTopRightRadius: radius.sheet,
          paddingHorizontal: 24,
          paddingTop: 12,
          paddingBottom: insets.bottom + 16,
        }}
      >
        <View style={{ alignSelf: "center", width: 40, height: 5, borderRadius: 5, backgroundColor: color.line, marginBottom: 16 }} />
        {title ? (
          <Text variant="section" style={{ marginBottom: 8 }}>
            {title}
          </Text>
        ) : null}
        {children}
      </View>
    </Modal>
  );
}

/** Ligne d'action dans une feuille. */
export function SheetAction({ label, onPress, destructive }: { label: string; onPress: () => void; destructive?: boolean }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => ({ paddingVertical: 16, borderTopWidth: 1, borderTopColor: color.line, opacity: pressed ? 0.6 : 1 })}>
      <Text variant="rowTitle" tone={destructive ? "danger" : "ink"}>
        {label}
      </Text>
    </Pressable>
  );
}
