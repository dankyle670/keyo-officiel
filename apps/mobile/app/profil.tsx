import { Alert, View } from "react-native";
import { router } from "expo-router";
import { Bell, Bot, CreditCard, CircleHelp, Database, FileText, Fingerprint, Send, SlidersHorizontal, UserRound, Wallet, Landmark, Users } from "lucide-react-native";
import { currencyLabel, SUBSCRIPTION_STATUS_LABEL } from "@keyo/shared";
import { initialsOf } from "@/data/selectors";
import { session, useSettings, useUser } from "@/data/session";
import { useOwnerState } from "@/data/store";
import { ActionRow, IconCircle, NavRow, SettingsGroup, SubScreen, Text } from "@/ui";
import type { SettingsSection } from "./reglages/[section]";

const open = (section: SettingsSection) => router.push({ pathname: "/reglages/[section]", params: { section } });

/**
 * Profil, sur le modèle des réglages de ChatGPT et Claude : groupes courts, une page par sujet,
 * valeur actuelle en gris. « Abonnement » (ce que vous payez à Keyo) et « Comptes de réception »
 * (où arrivent vos loyers) sont deux pages distinctes qui ne se mélangent jamais.
 */
export default function Profile() {
  const user = useUser();
  const settings = useSettings();
  const assetCount = useOwnerState((s) => s.assets.length);
  const familyCount = useOwnerState((s) => s.parties.filter((p) => p.role === "FAMILY").length);
  const name = `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim();
  const notifOn = Object.values(settings.notifications).filter(Boolean).length;
  const notifTotal = Object.values(settings.notifications).length;
  const plan = useOwnerState((s) => s.subscription);
  const payout = useOwnerState((s) => (s.paymentAccounts ?? []).find((a) => a.purpose === "RECEIVE" && a.status === "VERIFIED" && a.isDefault));

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

      <SettingsGroup title="Compte">
        <NavRow icon={UserRound} title="Informations personnelles" value={user.phone} onPress={() => open("compte")} />
        <NavRow icon={CreditCard} title="Abonnement" value={plan ? `${plan.plan ? plan.plan.name : "Sur mesure"} · ${SUBSCRIPTION_STATUS_LABEL[plan.status].toLowerCase()}` : undefined} onPress={() => router.push("/abonnement")} />
        <NavRow icon={Fingerprint} title="Sécurité" value={settings.biometricLock ? "Face ID" : "Désactivée"} onPress={() => open("securite")} />
      </SettingsGroup>

      <SettingsGroup title="Mes loyers">
        <NavRow icon={Wallet} title="Comptes de réception" value={payout ? `${payout.label} ${payout.masked}` : "À configurer"} onPress={() => router.push("/encaissement")} />
        <NavRow icon={Send} title="Relances" value={user.autoReminders ? "Automatiques" : "Désactivées"} onPress={() => open("relances")} />
      </SettingsGroup>

      <SettingsGroup title="Keyo">
        <NavRow icon={Bot} title="Agent Keyo" value="Accord et autonomie" onPress={() => open("agent")} />
        <NavRow icon={Users} title="Famille et patrimoine" value={familyCount ? `${familyCount} proche${familyCount > 1 ? "s" : ""}` : undefined} onPress={() => router.push("/famille")} />
        <NavRow icon={Landmark} title="Passeport propriétaire" onPress={() => router.push("/passeport")} />
      </SettingsGroup>

      <SettingsGroup title="Application">
        <NavRow icon={SlidersHorizontal} title="Préférences" value={`${currencyLabel(user.displayCurrency)}, français`} onPress={() => open("preferences")} />
        <NavRow icon={Bell} title="Notifications" value={`${notifOn} sur ${notifTotal}`} onPress={() => open("notifications")} />
        <NavRow icon={Database} title="Données" value={`${assetCount} bien${assetCount > 1 ? "s" : ""}`} onPress={() => open("donnees")} />
      </SettingsGroup>

      <SettingsGroup title="Assistance">
        <NavRow icon={CircleHelp} title="Aide et contact" onPress={() => router.push("/aide")} />
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
