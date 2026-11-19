import type { ReactNode } from "react";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { color, spacing } from "@keyo/tokens";
import { Text } from "./Text";
import { TAB_BAR_CLEARANCE } from "./TabBar";

type Props = { title?: string; right?: ReactNode; children: ReactNode; withTabBar?: boolean };

/** Écran standard : fond `surface`, marges de 24 px, grand titre en 800. */
export function Screen({ title, right, children, withTabBar = true }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: color.surface }}
      contentContainerStyle={{
        paddingTop: insets.top + 20,
        paddingHorizontal: spacing.screen,
        paddingBottom: (withTabBar ? TAB_BAR_CLEARANCE : 24) + insets.bottom,
      }}
    >
      {title ? (
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text variant="screenTitle" accessibilityRole="header">
            {title}
          </Text>
          {right}
        </View>
      ) : null}
      {children}
    </ScrollView>
  );
}

export function SectionTitle({ children, style }: { children: string; style?: object }) {
  return (
    <Text variant="section" accessibilityRole="header" style={[{ marginTop: 30, marginBottom: 2 }, style]}>
      {children}
    </Text>
  );
}
