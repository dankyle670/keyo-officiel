import { View } from "react-native";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { color } from "@keyo/tokens";
import { KeyoMark, LockMotif } from "@/brand/Logo";
import { Button, Text } from "@/ui";

/** Accueil avant connexion : la promesse, puis l'inscription par téléphone. */
export default function Welcome() {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: color.night, paddingTop: insets.top + 24, paddingBottom: insets.bottom + 16, paddingHorizontal: 24 }}>
      <StatusBar style="light" />
      <View style={{ position: "absolute", right: -60, top: 80 }} pointerEvents="none">
        <LockMotif size={340} />
      </View>
      <KeyoMark size={56} background={color.nightSoft} />
      <View style={{ flex: 1, justifyContent: "flex-end", gap: 14, paddingBottom: 32 }}>
        <Text variant="display" tone="onNight" style={{ fontSize: 44, lineHeight: 48 }}>
          Vos biens, gérés d'ici.
        </Text>
        <Text variant="body" style={{ color: "#B8C3D6" }}>
          Encaissez vos loyers, suivez vos locataires et vos travaux, où que vous soyez.
        </Text>
      </View>
      <View style={{ gap: 12 }}>
        <Button label="Créer un compte" onPress={() => router.push({ pathname: "/(auth)/telephone", params: { mode: "signup" } })} />
        <Button kind="secondary" label="J'ai déjà un compte" style={{ backgroundColor: color.nightSoft }} onPress={() => router.push({ pathname: "/(auth)/telephone", params: { mode: "login" } })} />
      </View>
    </View>
  );
}
