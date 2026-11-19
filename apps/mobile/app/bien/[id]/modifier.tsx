import { useState } from "react";
import { Alert, Pressable, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Trash2 } from "lucide-react-native";
import { cap, MINOR_UNITS, profileOf } from "@keyo/shared";
import { color, radius } from "@keyo/tokens";
import { today } from "@/data/period";
import { actions, useOwnerState } from "@/data/store";
import { Button, Chip, SectionTitle, SubScreen, Text, TextField } from "@/ui";

type UnitDraft = { id?: string; label: string; measure: string; rent: string; occupied: boolean };

const digits = (t: string) => t.replace(/\D/g, "");
const grouped = (t: string) => (t ? Number(t).toLocaleString("fr-FR").replace(/\s/g, " ") : "");

/** Modifier un bien : nom, sous-type, adresse, prix d'achat, unités et montants demandés. */
export default function EditAsset() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const state = useOwnerState((s) => s);
  const asset = state.assets.find((a) => a.id === id);
  const profile = profileOf(asset?.type ?? "REAL_ESTATE");
  const factor = 10 ** MINOR_UNITS[asset?.currency ?? "XOF"];
  const key = profile.measure?.key;
  const occupied = new Set(state.agreements.filter((g) => g.assetId === id && (!g.endDate || g.endDate >= today())).map((g) => g.unitId));

  const [name, setName] = useState(asset?.name ?? "");
  const [kind, setKind] = useState(String(asset?.details.kind ?? ""));
  const [address, setAddress] = useState(asset?.location.address ?? "");
  const [city, setCity] = useState(asset?.location.city ?? "");
  const [purchase, setPurchase] = useState(typeof asset?.details.purchasePrice === "number" ? String(asset.details.purchasePrice / factor) : "");
  const [units, setUnits] = useState<UnitDraft[]>(() =>
    state.units
      .filter((u) => u.assetId === id)
      .map((u) => ({
        id: u.id,
        label: u.label,
        measure: key && typeof u.details[key] === "number" ? String(u.details[key]).replace(".", ",") : "",
        rent: typeof u.details.askingRent === "number" ? String(u.details.askingRent / factor) : "",
        occupied: occupied.has(u.id),
      })),
  );
  const [removed, setRemoved] = useState<string[]>([]);

  if (!asset) {
    return (
      <SubScreen title="Bien introuvable">
        <Text variant="body" tone="inkMuted">
          Ce bien n'existe plus sur ce téléphone.
        </Text>
      </SubScreen>
    );
  }

  const currencyLabel = asset.currency === "XOF" ? "FCFA" : asset.currency === "EUR" ? "€" : asset.currency;
  const ok = name.trim().length > 1 && units.length > 0 && units.every((u) => u.label.trim());
  const setUnit = (i: number, patch: Partial<UnitDraft>) => setUnits((list) => list.map((u, j) => (j === i ? { ...u, ...patch } : u)));
  const measureValue = (m: string) => {
    const n = Number(m.replace(",", "."));
    if (!key || !(n > 0)) return {};
    return { [key]: key === "areaHa" || key === "surfaceM2" ? n : Math.round(n) };
  };

  const save = () => {
    actions.updateAsset(asset.id, {
      name: name.trim(),
      address: address.trim(),
      city: city.trim(),
      details: { kind, purchasePrice: purchase ? Number(purchase) * factor : undefined },
    });
    removed.forEach((uid) => actions.deleteUnit(uid));
    units.forEach((u) => {
      const details = { ...measureValue(u.measure), askingRent: u.rent ? Number(u.rent) * factor : undefined };
      if (u.id) actions.updateUnit(u.id, { label: u.label.trim(), details });
      else actions.addUnit(asset.id, u.label.trim(), details);
    });
    router.back();
  };

  const remove = (i: number) => {
    const u = units[i]!;
    if (u.occupied) {
      Alert.alert(`${cap(profile.unit.one)} occupé${profile.unit.feminine ? "e" : ""}`, `Mettez d'abord fin au ${profile.agreement.one} de son ${profile.occupant.one}.`);
      return;
    }
    if (u.id) setRemoved((r) => [...r, u.id!]);
    setUnits((list) => list.filter((_, j) => j !== i));
  };

  return (
    <SubScreen title="Modifier" subtitle={asset.name} footer={<Button label="Enregistrer" disabled={!ok} onPress={save} />}>
      <SectionTitle>{profile.label}</SectionTitle>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
        {Object.entries(profile.kinds).map(([k, label]) => (
          <Chip key={k} active={k === kind} label={label} onPress={() => setKind(k)} />
        ))}
      </View>
      <TextField label="Nom" value={name} onChangeText={setName} autoCapitalize="words" />
      <TextField label="Adresse ou lieu" value={address} onChangeText={setAddress} />
      <TextField label="Ville" value={city} onChangeText={setCity} />
      <TextField label={`Prix d'achat (${currencyLabel}), facultatif`} value={grouped(purchase)} onChangeText={(t) => setPurchase(digits(t))} keyboardType="number-pad" hint="Sert au calcul de la rentabilité." />

      <SectionTitle>{cap(profile.unit.many)}</SectionTitle>
      <Text variant="rowSubtitle" tone="inkMuted" style={{ marginTop: 4 }}>
        Le montant demandé s'applique au prochain {profile.occupant.one}. Pour un contrat en cours, modifiez le contrat.
      </Text>
      {units.map((u, i) => (
        <View key={u.id ?? `new-${i}`} style={{ marginTop: 14, padding: 16, borderRadius: radius.card, backgroundColor: color.surfaceRaised }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text variant="rowTitle">{u.occupied ? `${cap(profile.unit.one)} occupé${profile.unit.feminine ? "e" : ""}` : u.id ? `${cap(profile.unit.one)} libre` : `Nouve${profile.unit.feminine ? "lle" : "au"} ${profile.unit.one}`}</Text>
            <Pressable onPress={() => remove(i)} hitSlop={10} accessibilityRole="button" accessibilityLabel={`Retirer ${u.label || profile.unit.one}`}>
              <Trash2 size={20} strokeWidth={1.8} color={u.occupied ? color.track : color.danger} />
            </Pressable>
          </View>
          <TextField label={asset.type === "VEHICLE" ? "Modèle et immatriculation" : "Nom"} value={u.label} onChangeText={(t) => setUnit(i, { label: t })} />
          <View style={{ flexDirection: "row", gap: 12 }}>
            {profile.measure && (
              <View style={{ width: 130 }}>
                <TextField label={profile.measure.label} value={u.measure} onChangeText={(t) => setUnit(i, { measure: t.replace(/[^\d,]/g, "") })} keyboardType="decimal-pad" />
              </View>
            )}
            <View style={{ flex: 1 }}>
              <TextField label={`${cap(profile.amount)} demandé (${currencyLabel})`} value={grouped(u.rent)} onChangeText={(t) => setUnit(i, { rent: digits(t) })} keyboardType="number-pad" />
            </View>
          </View>
        </View>
      ))}
      <View style={{ marginTop: 16 }}>
        <Button
          kind="soft"
          label={`Ajouter ${profile.unit.feminine ? "une" : "un"} ${profile.unit.one}`}
          onPress={() => setUnits((list) => [...list, { label: `${cap(profile.unit.one)} ${list.length + 1}`, measure: "", rent: list[list.length - 1]?.rent ?? "", occupied: false }])}
        />
      </View>
    </SubScreen>
  );
}
