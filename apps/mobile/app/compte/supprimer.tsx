import { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { color } from "@keyo/tokens";
import { accountApi, AccountApiError, type DeletionChallenge } from "@/account/api";
import { conversation } from "@/agent/conversation";
import { session, useUser } from "@/data/session";
import { actions } from "@/data/store";
import { Button, SettingsGroup, SubScreen, Text, TextField } from "@/ui";

const DELETED = [
  "Vos biens, logements, contrats, documents et photos",
  "Vos conversations avec l'agent Keyo",
  "Vos comptes de réception et votre moyen de paiement",
  "Le journal et les réglages des agents autonomes",
];

function Bullet({ children }: { children: string }) {
  return (
    <View style={{ flexDirection: "row", gap: 10, paddingVertical: 6 }}>
      <View style={{ width: 6, height: 6, borderRadius: 3, marginTop: 9, backgroundColor: color.inkMuted }} />
      <Text variant="body" style={{ flex: 1 }}>
        {children}
      </Text>
    </View>
  );
}

/**
 * Supprimer le compte : ce qui est effacé, ce qui est conservé, puis confirmation par code SMS.
 * Irréversible. L'abonnement s'arrête aussitôt, sans nouveau prélèvement.
 */
export default function DeleteAccount() {
  const user = useUser();
  const [challenge, setChallenge] = useState<DeletionChallenge>();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const run = async (task: () => Promise<void>) => {
    setBusy(true);
    setError(undefined);
    try {
      await task();
    } catch (e) {
      setError(e instanceof AccountApiError ? e.message : "Suppression impossible pour l'instant.");
    } finally {
      setBusy(false);
    }
  };

  const request = () => run(async () => setChallenge(await accountApi.requestDeletion()));
  const confirm = () =>
    run(async () => {
      await accountApi.confirmDeletion(challenge!.challengeId, code);
      // Le serveur a tout effacé : on vide aussi le téléphone, puis on revient à l'accueil.
      await conversation.reset();
      await actions.reset();
      await session.signOut();
      router.replace("/");
    });

  return (
    <SubScreen
      title="Supprimer le compte"
      footer={
        challenge ? (
          <Button kind="secondary" label="Supprimer définitivement" disabled={busy || code.trim().length < 6} onPress={confirm} />
        ) : (
          <Button kind="secondary" label="Recevoir le code de confirmation" disabled={busy} onPress={request} />
        )
      }
    >
      <Text variant="body" tone="inkMuted" style={{ marginTop: 16 }}>
        La suppression est définitive. Elle concerne le compte {user.phone}.
      </Text>

      <SettingsGroup title="Sera supprimé">
        <View style={{ paddingVertical: 8 }}>
          {DELETED.map((d) => (
            <Bullet key={d}>{d}</Bullet>
          ))}
        </View>
      </SettingsGroup>

      <SettingsGroup title="Abonnement">
        <Text variant="body" style={{ paddingVertical: 14 }}>
          Il s'arrête tout de suite : plus aucun prélèvement ni relance. La période en cours n'est pas remboursée.
        </Text>
      </SettingsGroup>

      <SettingsGroup title="Sera conservé" footer="Les reçus de paiement sont gardés le temps imposé par la loi pour la comptabilité, puis effacés.">
        <Bullet>Les reçus de l'abonnement déjà payés</Bullet>
      </SettingsGroup>

      <SettingsGroup title="Avant de partir">
        <Text variant="body" style={{ paddingVertical: 14 }}>
          Prévenez vos locataires : ils ne pourront plus payer leur loyer ni signaler d'incident par Keyo. Les loyers déjà versés restent sur vos comptes.
        </Text>
      </SettingsGroup>

      {challenge ? (
        <>
          <TextField label="Code reçu par SMS" value={code} onChangeText={(t) => setCode(t.replace(/\D/g, "").slice(0, 6))} keyboardType="number-pad" placeholder="000000" autoFocus />
          {challenge.simulated ? (
            <Text variant="caption" tone="inkMuted" style={{ marginTop: 6 }}>
              Envoi de SMS simulé en démonstration : le code est 123456.
            </Text>
          ) : null}
        </>
      ) : null}

      {error ? (
        <Text variant="rowSubtitle" tone="danger" style={{ marginTop: 12 }}>
          {error}
        </Text>
      ) : null}
    </SubScreen>
  );
}
