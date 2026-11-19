import { useState } from "react";
import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { House, KeyRound, type LucideIcon } from "lucide-react-native";
import { color, radius } from "@keyo/tokens";
import { session, type Role } from "@/data/session";
import { Button, IconCircle, SubScreen, Text } from "@/ui";

const ROLES: { role: Role; title: string; body: string; icon: LucideIcon }[] = [
  { role: "OWNER", title: "Je suis propriétaire", body: "Je gère un ou plusieurs biens, sur place ou à distance.", icon: House },
  { role: "TENANT", title: "Je suis locataire", body: "Je paie mon loyer et je signale un problème dans mon logement.", icon: KeyRound },
];

export default function RoleStep() {
  const [role, setRole] = useState<Role>();
  return (
    <SubScreen
      title="Vous êtes…"
      subtitle="Vous pourrez ajouter l'autre rôle plus tard depuis votre profil."
      onBack={() => session.signOut().then(() => router.replace("/(auth)/bienvenue"))}
      footer={
        <Button
          label="Continuer"
          disabled={!role}
          onPress={() => {
            session.update({ role });
            router.push("/(auth)/profil");
          }}
        />
      }
    >
      <View style={{ gap: 12, marginTop: 24 }}>
        {ROLES.map((r) => {
          const active = r.role === role;
          return (
            <Pressable
              key={r.role}
              onPress={() => setRole(r.role)}
              accessibilityRole="radio"
              accessibilityState={{ checked: active }}
              style={{
                flexDirection: "row",
                gap: 16,
                alignItems: "center",
                padding: 20,
                borderRadius: radius.card,
                backgroundColor: active ? color.mintTint : color.surfaceRaised,
                borderWidth: 2,
                borderColor: active ? color.mint : "transparent",
              }}
            >
              <IconCircle icon={r.icon} bg={active ? "mint" : "surfaceSoft"} fg={active ? "onMint" : "ink"} />
              <View style={{ flex: 1 }}>
                <Text variant="rowTitle">{r.title}</Text>
                <Text variant="rowSubtitle" tone="inkMuted">
                  {r.body}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </SubScreen>
  );
}
