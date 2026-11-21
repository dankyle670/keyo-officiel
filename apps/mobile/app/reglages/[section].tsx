import { useEffect, useState } from "react";
import { Alert, Share, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Cable, History, SlidersHorizontal } from "lucide-react-native";
import * as LocalAuthentication from "expo-local-authentication";
import { conversation } from "@/agent/conversation";
import { speak, voiceQuality } from "@/agent/voice";
import { session, useSettings, useUser, type Settings } from "@/data/session";
import { actions, getOwnerState, useOwnerState } from "@/data/store";
import { ActionRow, Button, CurrencySelect, InfoRow, NavRow, Segmented, SettingsGroup, SubScreen, Text, TextField, ToggleRow } from "@/ui";

export type SettingsSection = "compte" | "securite" | "relances" | "agent" | "preferences" | "notifications" | "donnees";

const TITLES: Record<SettingsSection, { title: string; subtitle?: string }> = {
  compte: { title: "Informations", subtitle: "Votre identité dans Keyo" },
  securite: { title: "Sécurité" },
  relances: { title: "Relances", subtitle: "Quand un loyer n'est pas reçu à temps" },
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
          <SettingsGroup title="En votre absence" footer="Keyo travaille aussi quand vous n'êtes pas là : relances, quittances, incidents, rappels. Vous décidez de ce qu'il fait seul ; tout est consigné et vous pouvez lui en parler dans le chat.">
            <NavRow icon={History} tint="mintTint" ink="mintDeep" title="Ce que Keyo a fait" value="Journal et accords" onPress={() => router.push("/agent")} />
            <NavRow icon={SlidersHorizontal} tint="mintTint" ink="mintDeep" title="Autonomie" value="Par action" onPress={() => router.push("/agent/autonomie")} />
            <NavRow icon={Cable} tint="mintTint" ink="mintDeep" title="Connexions" value="WhatsApp, SMS…" onPress={() => router.push("/agent/connexions")} />
          </SettingsGroup>
          <VoiceSetting on={settings.agentSpeaks} onChange={(v) => set({ agentSpeaks: v })} />
          <SettingsGroup>
            <ActionRow title="Effacer toutes les conversations" destructive onPress={() => conversation.reset()} />
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
      <SettingsGroup>
        <ActionRow title="Supprimer mon compte" destructive onPress={() => router.push("/compte/supprimer")} />
      </SettingsGroup>
    </>
  );
}

function Data() {
  const user = useUser();
  const settings = useSettings();
  const assetCount = useOwnerState((s) => s.assets.length);
  const freeUnits = useOwnerState((s) => {
    const busy = new Set(s.agreements.filter((g) => !g.endDate || g.endDate >= new Date().toISOString().slice(0, 10)).map((g) => g.unitId));
    return s.units.filter((u) => !busy.has(u.id)).length;
  });
  const fakes = () => {
    const n = actions.addFakeOccupants();
    Alert.alert("Occupants fictifs créés", `${n} occupant${n > 1 ? "s" : ""} fictif${n > 1 ? "s" : ""}, avec quatre mois d'échéances payées. Leur nom porte la mention « fictif ».`);
  };
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
      <SettingsGroup footer="Pour tester l'app : un occupant fictif est créé sur chaque unité libre (logement, parcelle, véhicule…).">
        <ActionRow title={freeUnits ? `Occupants fictifs (${freeUnits} unité${freeUnits > 1 ? "s" : ""} libre${freeUnits > 1 ? "s" : ""})` : "Aucune unité libre"} onPress={freeUnits ? fakes : () => undefined} />
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

/** Voix de l'agent : essai, et conseil pour installer une voix de meilleure qualité sur l'iPhone. */
function VoiceSetting({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  const [quality, setQuality] = useState<"premium" | "standard">();
  useEffect(() => void voiceQuality().then(setQuality), []);
  return (
    <SettingsGroup
      title="Voix"
      footer={
        quality === "standard"
          ? "Pour une voix plus naturelle, téléchargez une voix française de qualité sur votre iPhone : Réglages > Accessibilité > Contenu énoncé > Voix > Français, puis « Audrey (Premium) » ou « Thomas (améliorée) ». Keyo l'utilisera automatiquement."
          : "Keyo utilise la meilleure voix française installée sur votre téléphone."
      }
    >
      <ToggleRow title="Lire les réponses à voix haute" value={on} onChange={onChange} />
      <ActionRow title="Écouter un exemple" onPress={() => void speak("Bonjour, je suis l'agent Keyo. Ce mois-ci, vos 13 loyers sont tous encaissés, soit 3 580 000 FCFA. Voulez-vous le détail par bien ?")} />
    </SettingsGroup>
  );
}
