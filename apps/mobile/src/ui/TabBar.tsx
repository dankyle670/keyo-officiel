import { Pressable, View } from "react-native";
import type { BottomTabBarProps } from "expo-router/tabs";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Building2, House, Sparkles, Wallet, Wrench, type LucideIcon } from "lucide-react-native";
import { color, size } from "@keyo/tokens";
import { Text } from "./Text";

/** Hauteur à réserver en bas des écrans pour ne pas passer sous la barre flottante. */
export const TAB_BAR_CLEARANCE = size.tabBar + 32;

const ICONS: Record<string, LucideIcon> = {
  index: House,
  biens: Building2,
  loyers: Wallet,
  incidents: Wrench,
  assistant: Sparkles,
};

/** Barre iPhone : pilule `night` flottante, onglet actif `mint` avec son libellé. */
export function FloatingTabBar({ state, descriptors, emitter, navigateToTab }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        position: "absolute",
        left: 16,
        right: 16,
        bottom: Math.max(insets.bottom - 6, 12),
        height: size.tabBar,
        borderRadius: 999,
        backgroundColor: color.night,
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 8,
        shadowColor: color.night,
        shadowOpacity: 0.25,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 8 },
      }}
    >
      {state.routes.map((route, index) => {
        const focused = state.index === index;
        const { options } = descriptors[route.key]!;
        const label = typeof options.title === "string" ? options.title : route.name;
        const Icon = ICONS[route.name] ?? House;
        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={label}
            onPress={() => {
              const event = emitter.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
              if (!focused && !event.defaultPrevented) navigateToTab(route.key);
            }}
            style={{
              flex: focused ? 0 : 1,
              height: 48,
              borderRadius: 999,
              backgroundColor: focused ? color.mint : "transparent",
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              paddingHorizontal: focused ? 18 : 0,
            }}
          >
            <Icon size={22} strokeWidth={1.8} color={focused ? color.onMint : color.onNight} />
            {focused && (
              <Text variant="rowTitle" tone="onMint" style={{ fontFamily: "PlusJakartaSans_800ExtraBold" }}>
                {label}
              </Text>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}
