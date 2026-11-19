import { useEffect, useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { color } from "@keyo/tokens";
import { DkSymbol, KeyoMark } from "@/brand/Logo";
import { useSession } from "@/data/session";
import { Text } from "@/ui";

/** Écran de démarrage (01-Splash), seul écran à porter la signature DK Group. Oriente ensuite selon le compte. */
export default function Splash() {
  const s = useSession();
  const [minDelay, setMinDelay] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setMinDelay(true), 1200);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!minDelay || s.status === "loading") return;
    if (s.status === "signedOut") return router.replace("/(auth)/bienvenue");
    const u = s.user;
    if (!u.role) return router.replace("/(auth)/role");
    if (!u.firstName) return router.replace("/(auth)/profil");
    router.replace(u.role === "OWNER" ? "/(owner)" : "/locataire");
  }, [minDelay, s]);

  return (
    <View style={{ flex: 1, backgroundColor: color.night }}>
      <StatusBar style="light" />
      <DotGrid />
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 18 }}>
        <KeyoMark size={112} background={color.nightSoft} />
        <Text variant="display" tone="onNight" style={{ fontSize: 64, lineHeight: 64, letterSpacing: -3.2 }}>
          keyo
        </Text>
        <Text variant="bodyStrong" tone="mint" style={{ fontSize: 17, fontFamily: "PlusJakartaSans_700Bold" }}>
          Vos biens, gérés d'ici.
        </Text>
      </View>
      <View style={{ position: "absolute", left: 0, right: 0, bottom: 48, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, opacity: 0.7 }}>
        <Text style={{ fontSize: 10, lineHeight: 14, letterSpacing: 1.4, fontFamily: "PlusJakartaSans_700Bold", color: "#B8C3D6" }}>UN PRODUIT</Text>
        <DkSymbol width={40} />
      </View>
    </View>
  );
}

/** Trame de points en triangle, en haut à droite (motif de la maquette). */
function DotGrid() {
  const rows = [6, 5, 4, 3, 2, 1];
  return (
    <View style={{ position: "absolute", top: 70, right: 24 }}>
      {rows.map((n, r) => (
        <View key={r} style={{ flexDirection: "row", gap: 16, marginBottom: 16 }}>
          {Array.from({ length: n }, (_, i) => (
            <View key={i} style={{ width: 6, height: 6, borderRadius: 6, backgroundColor: color.nightSoft }} />
          ))}
        </View>
      ))}
    </View>
  );
}
