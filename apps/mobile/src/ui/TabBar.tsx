import { LayoutAnimation, Pressable, useWindowDimensions, View } from "react-native";
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
// Part de largeur de l'onglet actif face aux autres (1 chacun) : la barre garde la même forme
// quel que soit le libellé, de l'iPhone SE (320 pt) au Pro Max (440 pt).
const ACTIVE_FLEX = 2.6;
const SIDE = 16;
const INNER_PADDING = 6;

export function FloatingTabBar({ state, descriptors, emitter, navigateToTab }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  // Largeur max : sur grand écran (iPad, paysage), la barre reste à taille de pouce, centrée.
  const barWidth = Math.min(width - SIDE * 2, 440);
  const compact = barWidth < 340;
  const iconSize = compact ? 20 : 22;

  return (
    <View
      style={{
        position: "absolute",
        alignSelf: "center",
        width: barWidth,
        bottom: Math.max(insets.bottom - 6, 12),
        height: size.tabBar,
        borderRadius: 999,
        backgroundColor: color.night,
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: INNER_PADDING,
        shadowColor: color.night,
        shadowOpacity: 0.25,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 8 },
        elevation: 12,
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
            hitSlop={{ top: 8, bottom: 8 }}
            onPress={() => {
              const event = emitter.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
              if (!focused && !event.defaultPrevented) {
                LayoutAnimation.configureNext(LayoutAnimation.create(180, "easeInEaseOut", "scaleXY"));
                navigateToTab(route.key);
              }
            }}
            style={{
              flex: focused ? ACTIVE_FLEX : 1,
              minWidth: 0,
              height: 52,
              borderRadius: 999,
              backgroundColor: focused ? color.mint : "transparent",
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: compact ? 4 : 6,
              paddingHorizontal: focused ? (compact ? 8 : 12) : 0,
            }}
          >
            <Icon size={iconSize} strokeWidth={1.8} color={focused ? color.onMint : color.onNight} />
            {focused && (
              <Text
                variant="rowTitle"
                tone="onMint"
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.75}
                style={{ flexShrink: 1, fontSize: compact ? 14 : 15, fontFamily: "PlusJakartaSans_800ExtraBold" }}
              >
                {label}
              </Text>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}
