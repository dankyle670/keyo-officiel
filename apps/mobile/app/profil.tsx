import { Alert, View } from "react-native";
import { router } from "expo-router";
import { Bell, Bot, CircleHelp, Database, FileText, Fingerprint, Send, SlidersHorizontal, UserRound, Wallet } from "lucide-react-native";
import { currencyLabel } from "@keyo/shared";
import { initialsOf } from "@/data/selectors";
import { session, useSettings, useUser } from "@/data/session";
import { useOwnerState } from "@/data/store";
import { ActionRow, IconCircle, NavRow, SettingsGroup, SubScreen, Text } from "@/ui";
import type { SettingsSection } from "./reglages/[section]";

const open = (section: SettingsSection) => router.push({ pathname: "/reglages/[section]", params: { section } });

/** Profil : identité, puis les réglages rangés par rubrique (une page par rubrique). */
export default function Profile() {
  const user = useUser();
  const settings = useSettings();
  const assetCount = useOwnerState((s) => s.assets.length);
  const name = `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim();
  const notifOn = Object.values(settings.notifications).filter(Boolean).length;
  const notifTotal = Object.values(settings.notifications).length;
  const methods = [settings.paymentMethods.mobileMoney && "Mobile Money", settings.paymentMethods.card && "carte", settings.paymentMethods.bankTransfer && "virement"].filter(Boolean).join(", ");

  const signOut = () =>
    Alert.alert("Se déconnecter ?", "Vos données restent enregistrées sur ce téléphone.", [
      { text: "Annuler", style: "cancel" },
      { text: "Se déconnecter", style: "destructive", onPress: () => session.signOut() },
    ]);

  return (
    <SubScreen title="Profil">
      <View style={{ flexDirection: "row", alignItems: "center", gap: 16, marginTop: 20 }}>
        <IconCircle initials={initialsOf(name) || "K"} bg="mint" fg="onMint" diameter={64} />
        <View style={{ flex: 1 }}>
          <Text variant="heading">{name}</Text>
          <Text variant="rowSubtitle" tone="inkMuted">
            {user.phone}, propriétaire
          </Text>
        </View>
      </View>

      <SettingsGroup title="Mon compte">
        <NavRow icon={UserRound} tint="mintTint" ink="mintDeep" title="Informations personnelles" value={name} onPress={() => open("compte")} />
        <NavRow icon={Fingerprint} tint="mintTint" ink="mintDeep" title="Sécurité" value={settings.biometricLock ? "Face ID activé" : "Face ID désactivé"} onPress={() => open("securite")} />
      </SettingsGroup>

      <SettingsGroup title="Gestion">
        <NavRow icon={Send} tint="amberTint" ink="amber" title="Relances" value={user.autoReminders ? "Automatiques" : "Désactivées"} onPress={() => open("relances")} />
        <NavRow icon={Wallet} tint="amberTint" ink="amber" title="Encaissement" value={methods || "Aucun moyen"} onPress={() => open("encaissement")} />
        <NavRow icon={Bot} tint="amberTint" ink="amber" title="Agent Keyo" value={settings.agentConfirm === "ALWAYS" ? "Accord à chaque action" : "Accord pour l'argent"} onPress={() => open("agent")} />
      </SettingsGroup>

      <SettingsGroup title="Application">
        <NavRow icon={SlidersHorizontal} title="Préférences" value={`${currencyLabel(user.displayCurrency)}, français`} onPress={() => open("preferences")} />
        <NavRow icon={Bell} title="Notifications" value={`${notifOn} sur ${notifTotal}`} onPress={() => open("notifications")} />
        <NavRow icon={Database} title="Données" value={`${assetCount} bien${assetCount > 1 ? "s" : ""}`} onPress={() => open("donnees")} />
      </SettingsGroup>

      <SettingsGroup title="Assistance">
        <NavRow icon={CircleHelp} title="Centre d'aide et contact" onPress={() => router.push("/aide")} />
        <NavRow icon={FileText} title="Conditions et confidentialité" onPress={() => router.push("/mentions")} />
      </SettingsGroup>

      <SettingsGroup>
        <ActionRow title="Se déconnecter" destructive onPress={signOut} />
      </SettingsGroup>

      <Text variant="caption" tone="inkMuted" align="center" style={{ marginTop: 24 }}>
        Keyo, version 0.2
      </Text>
    </SubScreen>
  );
}
