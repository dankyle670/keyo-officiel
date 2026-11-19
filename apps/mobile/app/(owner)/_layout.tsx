import { Tabs } from "expo-router/tabs";
import { color } from "@keyo/tokens";
import { FloatingTabBar } from "@/ui";

/** Navigation propriétaire : Accueil (carte) · Biens · Loyers · Incidents · Assistant. */
export default function OwnerLayout() {
  return (
    <Tabs
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: color.surface } }}
    >
      <Tabs.Screen name="index" options={{ title: "Accueil" }} />
      <Tabs.Screen name="biens" options={{ title: "Biens" }} />
      <Tabs.Screen name="loyers" options={{ title: "Loyers" }} />
      <Tabs.Screen name="incidents" options={{ title: "Incidents" }} />
      <Tabs.Screen name="assistant" options={{ title: "Agent" }} />
    </Tabs>
  );
}
