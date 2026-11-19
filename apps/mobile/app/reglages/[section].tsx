import { useState } from "react";
import { Alert, Share, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import * as LocalAuthentication from "expo-local-authentication";
import { conversation } from "@/agent/conversation";
import { session, useSettings, useUser, type Settings } from "@/data/session";
import { actions, getOwnerState, useOwnerState } from "@/data/store";
import { ActionRow, Button, CurrencySelect, InfoRow, Segmented, SettingsGroup, SubScreen, Text, TextField, ToggleRow } from "@/ui";

export type SettingsSection = "compte" | "securite" | "relances" | "encaissement" | "agent" | "preferences" | "notifications" | "donnees";

const TITLES: Record<SettingsSection, { title: string; subtitle?: string }> = {
  compte: { title: "Informations", subtitle: "Votre identité dans Keyo" },
  securite: { title: "Sécurité" },
  relances: { title: "Relances", subtitle: "Quand un loyer n'est pas reçu à temps" },
  encaissement: { title: "Encaissement", subtitle: "Moyens proposés à vos occupants" },
  agent: { title: "Agent Keyo", subtitle: "Comment l'agent travaille pour vous" },
  preferences: { title: "Préférences" },
  notifications: { title: "Notifications", subtitle: "Ce que Keyo vous signale" },
  donnees: { title: "Données" },
};

/** Page d'une rubrique des réglages. */
export default function SettingsPage() {
  const { section } = useLocalSearchParams<{ section: SettingsSection }>();
  const t = TITLES[section] ?? TITLES.preferences;
  return (
    <SubScreen title={t.title} subtitle={t.subtitle}>
      <Section section={section} />
    </SubScreen>
  );
}

function Section({ section }: { section: SettingsSection }) {
  const user = useUser();
  const settings = useSettings();
  const set = (patch: Partial<Settings>) => session.updateSettings(patch);

  switch (section) {
    case "compte":
      return <Account />;

    case "securite": {
      const toggle = async (on: boolean) => {
        if (!on) return set({ biometricLock: false });
        const [hardware, enrolled] = await Promise.all([LocalAuthentication.hasHardwareAsync(), LocalAuthentication.isEnrolledAsync()]);
        if (!hardware || !enrolled) return Alert.alert("Face ID indisponible", "Activez Face ID ou un code dans les réglages de l'iPhone, puis réessayez.");
        const r = await LocalAuthentication.authenticateAsync({ promptMessage: "Activer le verrouillage de Keyo", cancelLabel: "Annuler" });
        if (r.success) set({ biometricLock: true });
      };
      return (
        <SettingsGroup footer="Keyo demandera Face ID, ou le code de l'iPhone, à chaque ouverture.">
          <ToggleRow title="Verrouiller avec Face ID" value={settings.biometricLock} onChange={toggle} />
        </SettingsGroup>
      );
    }

    case "relances":
      return (
        <>
          <SettingsGroup footer="Rappel à J+1, relance à J+5, dernier rappel à J+10 après l'échéance.">
            <ToggleRow title="Relances automatiques" value={user.autoReminders} onChange={(v) => session.update({ autoReminders: v })} />
          </SettingsGroup>
          <SettingsGroup title="Canaux">
            <ToggleRow title="Par notification" value={settings.reminderChannels.push} onChange={(v) => set({ reminderChannels: { ...settings.reminderChannels, push: v } })} />
            <ToggleRow title="Par SMS" subtitle="Utile quand l'occupant n'ouvre pas l'app." value={settings.reminderChannels.sms} onChange={(v) => set({ reminderChannels: { ...settings.reminderChannels, sms: v } })} />
          </SettingsGroup>
          <SettingsGroup title="Ton des relances">
            <Segmented
              value={settings.reminderTone}
              options={[
                { value: "COURTEOUS", label: "Courtois" },
                { value: "FIRM", label: "Ferme" },
              ]}
              onChange={(reminderTone) => set({ reminderTone })}
            />
          </SettingsGroup>
        </>
      );

    case "encaissement":
      return (
        <SettingsGroup footer="Les paiements passent par notre partenaire de paiement agréé et arrivent directement chez vous. Keyo ne détient jamais vos fonds.">
          <ToggleRow title="Mobile Money" subtitle="Orange Money, MTN, Moov, Wave." value={settings.paymentMethods.mobileMoney} onChange={(v) => set({ paymentMethods: { ...settings.paymentMethods, mobileMoney: v } })} />
          <ToggleRow title="Carte bancaire" value={settings.paymentMethods.card} onChange={(v) => set({ paymentMethods: { ...settings.paymentMethods, card: v } })} />
          <ToggleRow title="Virement" value={settings.paymentMethods.bankTransfer} onChange={(v) => set({ paymentMethods: { ...settings.paymentMethods, bankTransfer: v } })} />
        </SettingsGroup>
      );

    case "agent":
      return (
        <>
          <SettingsGroup
            title="Demander mon accord"
            footer={
              settings.agentConfirm === "ALWAYS"
                ? "L'agent vous montre chaque modification avant de la faire."
                : "L'agent fait seul ce qui est sans risque (entretien, missions, devis) et vous demande pour l'argent, les occupants et les messages."
            }
          >
            <Segmented
              value={settings.agentConfirm}
              options={[
                { value: "ALWAYS", label: "À chaque action" },
                { value: "RISKY", label: "Argent et messages" },
              ]}
              onChange={(agentConfirm) => set({ agentConfirm })}
            />
          </SettingsGroup>
          <SettingsGroup>
            <ToggleRow title="Lire les réponses à voix haute" value={settings.agentSpeaks} onChange={(v) => set({ agentSpeaks: v })} />
          </SettingsGroup>
          <SettingsGroup>
            <ActionRow title="Effacer la conversation" destructive onPress={() => conversation.reset()} />
          </SettingsGroup>
        </>
      );

    case "preferences":
      return (
        <>
          <CurrencySelect value={user.displayCurrency} onChange={(c) => session.update({ displayCurrency: c })} />
          <SettingsGroup title="Langue">
            <Segmented
              value={settings.language}
              options={[
                { value: "fr", label: "Français" },
                { value: "en", label: "English, bientôt", disabled: true },
              ]}
              onChange={(language) => set({ language })}
            />
          </SettingsGroup>
        </>
      );

    case "notifications": {
      const n = settings.notifications;
      const setN = (patch: Partial<Settings["notifications"]>) => set({ notifications: { ...n, ...patch } });
      return (
        <>
          <SettingsGroup title="Loyers">
            <ToggleRow title="Paiement reçu" value={n.payments} onChange={(v) => setN({ payments: v })} />
            <ToggleRow title="Loyer en retard" value={n.late} onChange={(v) => setN({ late: v })} />
          </SettingsGroup>
          <SettingsGroup title="Biens">
            <ToggleRow title="Incident signalé" value={n.incidents} onChange={(v) => setN({ incidents: v })} />
            <ToggleRow title="Alertes du contrôle de gestion" subtitle="Pièce manquante, échéance fiscale, contrat qui se termine." value={n.compliance} onChange={(v) => setN({ compliance: v })} />
          </SettingsGroup>
          <SettingsGroup title="Synthèse">
            <ToggleRow title="Rapport du mois" subtitle="Le 1er de chaque mois, préparé par l'agent." value={n.monthlyReport} onChange={(v) => setN({ monthlyReport: v })} />
          </SettingsGroup>
        </>
      );
    }

    case "donnees":
      return <Data />;

    default:
      return null;
  }
}

function Account() {
  const user = useUser();
  const [firstName, setFirstName] = useState(user.firstName ?? "");
  const [lastName, setLastName] = useState(user.lastName ?? "");
  const dirty = firstName.trim() !== (user.firstName ?? "") || lastName.trim() !== (user.lastName ?? "");
  return (
    <>
      <TextField label="Prénom" value={firstName} onChangeText={setFirstName} autoCapitalize="words" />
      <TextField label="Nom" value={lastName} onChangeText={setLastName} autoCapitalize="words" />
      {dirty && (
        <View style={{ marginTop: 16 }}>
          <Button label="Enregistrer" onPress={() => session.update({ firstName: firstName.trim(), lastName: lastName.trim() })} />
        </View>
      )}
      <SettingsGroup footer="Le numéro sert à vous connecter par code SMS. Pour le changer, contactez l'assistance.">
        <InfoRow title="Téléphone" value={user.phone} />
        <InfoRow title="Rôle" value="Propriétaire" />
      </SettingsGroup>
    </>
  );
}

function Data() {
  const user = useUser();
  const settings = useSettings();
  const assetCount = useOwnerState((s) => s.assets.length);
  const exportData = () =>
    Share.share({ title: "Mes données Keyo", message: JSON.stringify({ exportedAt: new Date().toISOString(), profile: { ...user, settings }, data: getOwnerState() }, null, 2) });
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
    <>
      <SettingsGroup footer="Vos données sont enregistrées sur ce téléphone. L'export produit un fichier lisible que vous pouvez conserver.">
        <ActionRow title="Exporter mes données" onPress={exportData} />
        {assetCount === 0 ? <ActionRow title="Charger les données de démonstration" onPress={() => actions.loadDemo(user.id)} /> : null}
      </SettingsGroup>
      <SettingsGroup>
        <ActionRow title="Effacer toutes les données" destructive onPress={reset} />
      </SettingsGroup>
      <Text variant="caption" tone="inkMuted" style={{ marginTop: 16 }}>
        {assetCount} bien{assetCount > 1 ? "s" : ""} enregistré{assetCount > 1 ? "s" : ""}.
      </Text>
    </>
  );
}
