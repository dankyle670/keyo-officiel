import { useState } from "react";
import { Alert, Switch, View } from "react-native";
import { color, radius } from "@keyo/tokens";
import { initialsOf } from "@/data/selectors";
import { session, useUser } from "@/data/session";
import { actions, useOwnerState } from "@/data/store";
import { Button, CurrencySelect, IconCircle, SectionTitle, SheetAction, SubScreen, Text, TextField } from "@/ui";

/** Profil et réglages : identité, devise d'affichage, relances automatiques, données, déconnexion. */
export default function Profile() {
  const user = useUser();
  const assetCount = useOwnerState((s) => s.assets.length);
  const [firstName, setFirstName] = useState(user.firstName ?? "");
  const [lastName, setLastName] = useState(user.lastName ?? "");
  const name = `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim();
  const dirty = firstName.trim() !== (user.firstName ?? "") || lastName.trim() !== (user.lastName ?? "");

  const signOut = () =>
    Alert.alert("Se déconnecter ?", "Vos données restent enregistrées sur ce téléphone.", [
      { text: "Annuler", style: "cancel" },
      { text: "Se déconnecter", style: "destructive", onPress: () => session.signOut() },
    ]);

  const reset = () =>
    Alert.alert("Effacer toutes les données ?", "Biens, baux, documents et historique seront supprimés de ce téléphone.", [
      { text: "Annuler", style: "cancel" },
      { text: "Effacer", style: "destructive", onPress: () => actions.reset() },
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

      <SectionTitle>Identité</SectionTitle>
      <TextField label="Prénom" value={firstName} onChangeText={setFirstName} autoCapitalize="words" />
      <TextField label="Nom" value={lastName} onChangeText={setLastName} autoCapitalize="words" />
      {dirty && (
        <View style={{ marginTop: 16 }}>
          <Button kind="secondary" label="Enregistrer" onPress={() => session.update({ firstName: firstName.trim(), lastName: lastName.trim() })} />
        </View>
      )}

      <SectionTitle>Affichage</SectionTitle>
      <CurrencySelect value={user.displayCurrency} onChange={(c) => session.update({ displayCurrency: c })} />

      <SectionTitle>Relances</SectionTitle>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 16, padding: 18, borderRadius: radius.card, backgroundColor: color.surfaceRaised, marginTop: 8 }}>
        <View style={{ flex: 1 }}>
          <Text variant="rowTitle">Relances automatiques</Text>
          <Text variant="rowSubtitle" tone="inkMuted">
            Rappel à J+1, relance à J+5, dernier rappel à J+10, par notification puis SMS.
          </Text>
        </View>
        <Switch value={user.autoReminders} onValueChange={(v) => session.update({ autoReminders: v })} trackColor={{ true: color.mint, false: color.line }} accessibilityLabel="Relances automatiques" />
      </View>

      <SectionTitle>Données</SectionTitle>
      {assetCount === 0 && <SheetAction label="Charger les données de démonstration" onPress={() => actions.loadDemo(user.id)} />}
      <SheetAction label="Effacer toutes les données" destructive onPress={reset} />
      <SheetAction label="Se déconnecter" destructive onPress={signOut} />

      <Text variant="caption" tone="inkMuted" style={{ marginTop: 24 }}>
        Keyo, version 0.1.
      </Text>
    </SubScreen>
  );
}
