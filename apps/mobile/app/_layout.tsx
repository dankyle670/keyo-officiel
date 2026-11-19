import { useEffect } from "react";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
  useFonts,
} from "@expo-google-fonts/plus-jakarta-sans";
import { color } from "@keyo/tokens";
import { session, useAccess } from "@/data/session";
import { actions } from "@/data/store";

SplashScreen.preventAutoHideAsync();
// Session et données locales chargées dès le démarrage, en parallèle des polices.
session.hydrate();
actions.hydrate();

export default function RootLayout() {
  const access = useAccess();
  const [loaded, error] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
  });

  useEffect(() => {
    if (loaded || error) SplashScreen.hideAsync();
  }, [loaded, error]);

  if (!loaded && !error) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="dark" />
        {/* Routes protégées : si la session change (déconnexion), les écrans qui ne sont plus
            accessibles sont retirés et l'app repart de l'écran de démarrage, qui réoriente. */}
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.surface } }}>
          <Stack.Screen name="index" options={{ animation: "none" }} />
          <Stack.Protected guard={access === "onboarding"}>
            <Stack.Screen name="(auth)" options={{ animation: "fade" }} />
          </Stack.Protected>
          <Stack.Protected guard={access === "owner"}>
            <Stack.Screen name="(owner)" options={{ animation: "fade" }} />
            <Stack.Screen name="bien/nouveau" options={{ presentation: "modal" }} />
            <Stack.Screen name="bien/[id]/index" />
            <Stack.Screen name="bien/[id]/documents" />
            <Stack.Screen name="bien/[id]/finances" />
            <Stack.Screen name="bien/[id]/depense" options={{ presentation: "modal" }} />
            <Stack.Screen name="bien/[id]/inviter" options={{ presentation: "modal" }} />
            <Stack.Screen name="bail/[id]" />
            <Stack.Screen name="incident/[id]" />
            <Stack.Screen name="messages/[partyId]" />
            <Stack.Screen name="notifications" />
            <Stack.Screen name="recherche" />
            <Stack.Screen name="profil" />
          </Stack.Protected>
          <Stack.Protected guard={access === "tenant"}>
            <Stack.Screen name="locataire" />
          </Stack.Protected>
        </Stack>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
