import { Tabs } from "expo-router/tabs";
import { color } from "@keyo/tokens";
import { useAutonomousSync } from "@/autonomous/sync";
import { useEffect } from "react";
import { useUser } from "@/data/session";
import { actions, useOwnerState } from "@/data/store";
import { FloatingTabBar } from "@/ui";

/** Navigation propriétaire : Accueil (carte) · Biens · Loyers · Incidents · Assistant. */
export default function OwnerLayout() {
  // Données envoyées au serveur des agents autonomes, et leurs actions rapatriées.
  const user = useUser();
  useAutonomousSync(user);
  // Rattache au propriétaire connecté les biens créés sous un ancien identifiant.
  const assetCount = useOwnerState((s) => s.assets.length);
  useEffect(() => actions.adoptOwner(user.id), [user.id, assetCount]);
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
