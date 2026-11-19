import { useState, type ReactNode } from "react";
import { Alert, Pressable, Share, Switch, View } from "react-native";
import { router } from "expo-router";
import * as LocalAuthentication from "expo-local-authentication";
import { ChevronRight } from "lucide-react-native";
import { color, radius } from "@keyo/tokens";
import { conversation } from "@/agent/conversation";
import { initialsOf } from "@/data/selectors";
import { session, useSettings, useUser, type Settings } from "@/data/session";
import { actions, getOwnerState, useOwnerState } from "@/data/store";
import { Button, CurrencySelect, IconCircle, SectionTitle, SheetAction, SubScreen, Text, TextField } from "@/ui";

/** Profil et réglages de l'application. */
export default function Profile() {
  const user = useUser();
  const settings = useSettings();
  const assetCount = useOwnerState((s) => s.assets.length);
  const [firstName, setFirstName] = useState(user.firstName ?? "");
  const [lastName, setLastName] = useState(user.lastName ?? "");
  const name = `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim();
  const dirty = firstName.trim() !== (user.firstName ?? "") || lastName.trim() !== (user.lastName ?? "");
  const set = (patch: Partial<Settings>) => session.updateSettings(patch);

  const toggleBiometric = async (on: boolean) => {
    if (!on) return set({ biometricLock: false });
    const [hardware, enrolled] = await Promise.all([LocalAuthentication.hasHardwareAsync(), LocalAuthentication.isEnrolledAsync()]);
    if (!hardware || !enrolled) {
      Alert.alert("Face ID indisponible", "Activez Face ID ou un code dans les réglages de l'iPhone, puis réessayez.");
      return;
    }
    const r = await LocalAuthentication.authenticateAsync({ promptMessage: "Activer le verrouillage de Keyo", cancelLabel: "Annuler" });
    if (r.success) set({ biometricLock: true });
  };

  const exportData = () =>
    Share.share({ title: "Mes données Keyo", message: JSON.stringify({ exportedAt: new Date().toISOString(), profile: { ...user, settings }, data: getOwnerState() }, null, 2) });

  const signOut = () =>
    Alert.alert("Se déconnecter ?", "Vos données restent enregistrées sur ce téléphone.", [
      { text: "Annuler", style: "cancel" },
      { text: "Se déconnecter", style: "destructive", onPress: () => session.signOut() },
    ]);

  const reset = () =>
    Alert.alert("Effacer toutes les données ?", "Biens, baux, documents, historique et conversation avec l'agent seront supprimés de ce téléphone.", [
      { text: "Annuler", style: "cancel" },
      {
        text: "Effacer",
        style: "destructive",
        onPress: () => {
          actions.reset();
          conversation.reset();
        },
      },
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

      <SectionTitle>Compte</SectionTitle>
      <TextField label="Prénom" value={firstName} onChangeText={setFirstName} autoCapitalize="words" />
      <TextField label="Nom" value={lastName} onChangeText={setLastName} autoCapitalize="words" />
      {dirty && (
        <View style={{ marginTop: 16 }}>
          <Button kind="secondary" label="Enregistrer" onPress={() => session.update({ firstName: firstName.trim(), lastName: lastName.trim() })} />
        </View>
      )}

      <SectionTitle>Préférences</SectionTitle>
      <CurrencySelect value={user.displayCurrency} onChange={(c) => session.update({ displayCurrency: c })} />
      <Text variant="rowSubtitle" tone="inkMuted" style={{ marginTop: 20, marginBottom: 8 }}>
        Langue
      </Text>
      <Segmented
        value={settings.language}
        options={[
          { value: "fr", label: "Français" },
          { value: "en", label: "English, bientôt", disabled: true },
        ]}
        onChange={(language) => set({ language })}
      />

      <SectionTitle>Notifications</SectionTitle>
      <Group>
        <Toggle title="Paiement reçu" value={settings.notifications.payments} onChange={(v) => set({ notifications: { ...settings.notifications, payments: v } })} />
        <Toggle title="Loyer en retard" value={settings.notifications.late} onChange={(v) => set({ notifications: { ...settings.notifications, late: v } })} />
        <Toggle title="Incident signalé" value={settings.notifications.incidents} onChange={(v) => set({ notifications: { ...settings.notifications, incidents: v } })} />
        <Toggle title="Rapport du mois" subtitle="Le 1er de chaque mois, préparé par l'agent." value={settings.notifications.monthlyReport} onChange={(v) => set({ notifications: { ...settings.notifications, monthlyReport: v } })} />
        <Toggle title="Alertes du contrôle de gestion" subtitle="Pièce manquante, échéance fiscale, contrat qui se termine." value={settings.notifications.compliance} onChange={(v) => set({ notifications: { ...settings.notifications, compliance: v } })} />
      </Group>

      <SectionTitle>Relances</SectionTitle>
      <Group>
        <Toggle title="Relances automatiques" subtitle="Rappel à J+1, relance à J+5, dernier rappel à J+10." value={user.autoReminders} onChange={(v) => session.update({ autoReminders: v })} />
        <Toggle title="Par notification" value={settings.reminderChannels.push} onChange={(v) => set({ reminderChannels: { ...settings.reminderChannels, push: v } })} />
        <Toggle title="Par SMS" subtitle="Utile quand l'occupant n'ouvre pas l'app." value={settings.reminderChannels.sms} onChange={(v) => set({ reminderChannels: { ...settings.reminderChannels, sms: v } })} />
      </Group>
      <Text variant="rowSubtitle" tone="inkMuted" style={{ marginTop: 16, marginBottom: 8 }}>
        Ton des relances
      </Text>
      <Segmented
        value={settings.reminderTone}
        options={[
          { value: "COURTEOUS", label: "Courtois" },
          { value: "FIRM", label: "Ferme" },
        ]}
        onChange={(reminderTone) => set({ reminderTone })}
      />

      <SectionTitle>Encaissement</SectionTitle>
      <Group>
        <Toggle title="Mobile Money" subtitle="Orange Money, MTN, Moov, Wave." value={settings.paymentMethods.mobileMoney} onChange={(v) => set({ paymentMethods: { ...settings.paymentMethods, mobileMoney: v } })} />
        <Toggle title="Carte bancaire" value={settings.paymentMethods.card} onChange={(v) => set({ paymentMethods: { ...settings.paymentMethods, card: v } })} />
        <Toggle title="Virement" value={settings.paymentMethods.bankTransfer} onChange={(v) => set({ paymentMethods: { ...settings.paymentMethods, bankTransfer: v } })} />
      </Group>
      <Text variant="caption" tone="inkMuted" style={{ marginTop: 10 }}>
        Les paiements passent par notre partenaire de paiement agréé et arrivent directement chez vous. Keyo ne détient jamais vos fonds.
      </Text>

      <SectionTitle>Agent Keyo</SectionTitle>
      <Text variant="rowSubtitle" tone="inkMuted" style={{ marginTop: 8, marginBottom: 8 }}>
        Demander mon accord
      </Text>
      <Segmented
        value={settings.agentConfirm}
        options={[
          { value: "ALWAYS", label: "Avant toute modification" },
          { value: "RISKY", label: "Argent et messages" },
        ]}
        onChange={(agentConfirm) => set({ agentConfirm })}
      />
      <Group>
        <Toggle title="Lire les réponses à voix haute" value={settings.agentSpeaks} onChange={(v) => set({ agentSpeaks: v })} />
      </Group>

      <SectionTitle>Sécurité</SectionTitle>
      <Group>
        <Toggle title="Verrouiller avec Face ID" subtitle="Demandé à chaque ouverture de l'app." value={settings.biometricLock} onChange={toggleBiometric} />
      </Group>

      <SectionTitle>Données</SectionTitle>
      <SheetAction label="Exporter mes données" onPress={exportData} />
      {assetCount === 0 && <SheetAction label="Charger les données de démonstration" onPress={() => actions.loadDemo(user.id)} />}
      <SheetAction label="Effacer toutes les données" destructive onPress={reset} />

      <SectionTitle>Aide</SectionTitle>
      <Link label="Centre d'aide et contact" onPress={() => router.push("/aide")} />
      <Link label="Conditions et confidentialité" onPress={() => router.push("/mentions")} />

      <View style={{ marginTop: 24 }}>
        <SheetAction label="Se déconnecter" destructive onPress={signOut} />
      </View>

      <Text variant="caption" tone="inkMuted" style={{ marginTop: 24 }}>
        Keyo, version 0.2.
      </Text>
    </SubScreen>
  );
}

function Group({ children }: { children: ReactNode }) {
  return <View style={{ borderRadius: radius.card, backgroundColor: color.surfaceRaised, marginTop: 8, paddingHorizontal: 18 }}>{children}</View>;
}

function Toggle({ title, subtitle, value, onChange }: { title: string; subtitle?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 16, paddingVertical: 14 }}>
      <View style={{ flex: 1 }}>
        <Text variant="rowTitle">{title}</Text>
        {subtitle && (
          <Text variant="rowSubtitle" tone="inkMuted">
            {subtitle}
          </Text>
        )}
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: color.mint, false: color.line }} accessibilityLabel={title} />
    </View>
  );
}

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string; disabled?: boolean }[]; onChange: (v: T) => void }) {
  return (
    <View style={{ flexDirection: "row", backgroundColor: color.surfaceSoft, borderRadius: 999, padding: 4, gap: 4 }} accessibilityRole="radiogroup">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            disabled={o.disabled}
            onPress={() => onChange(o.value)}
            accessibilityRole="radio"
            accessibilityState={{ checked: active, disabled: o.disabled }}
            style={{ flex: 1, minHeight: 44, borderRadius: 999, alignItems: "center", justifyContent: "center", paddingHorizontal: 8, backgroundColor: active ? color.surfaceRaised : "transparent", opacity: o.disabled ? 0.45 : 1 }}
          >
            <Text variant="rowSubtitle" style={{ fontFamily: active ? "PlusJakartaSans_700Bold" : "PlusJakartaSans_500Medium" }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function Link({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", paddingVertical: 16, borderTopWidth: 1, borderTopColor: color.line, opacity: pressed ? 0.6 : 1 })}>
      <Text variant="rowTitle" style={{ flex: 1 }}>
        {label}
      </Text>
      <ChevronRight size={20} strokeWidth={1.8} color={color.inkMuted} />
    </Pressable>
  );
}
