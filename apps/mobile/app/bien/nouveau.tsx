import { useState } from "react";
import { Image, KeyboardAvoidingView, Pressable, ScrollView, View } from "react-native";
import { router } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Building, Building2, Camera, ChevronLeft, House, ImagePlus, Sprout, Store, Tractor, X, type LucideIcon } from "lucide-react-native";
import { RealEstateDetails, RealEstateUnitDetails, REAL_ESTATE_KIND_LABEL, type Asset, type AssetUnit, type Currency, type RealEstateKind } from "@keyo/shared";
import { color, radius } from "@keyo/tokens";
import { useUser } from "@/data/session";
import { actions } from "@/data/store";
import { Button, Chip, RoundButton, Text, TextField } from "@/ui";

type Choice = { kind: RealEstateKind; icon: LucideIcon } | { kind: "PLANTATION" | "FARM"; icon: LucideIcon; soon: true };
const CHOICES: Choice[] = [
  { kind: "APARTMENT", icon: Building },
  { kind: "HOUSE", icon: House },
  { kind: "BUILDING", icon: Building2 },
  { kind: "COMMERCIAL", icon: Store },
  { kind: "PLANTATION", icon: Sprout, soon: true },
  { kind: "FARM", icon: Tractor, soon: true },
];
const SOON_LABEL = { PLANTATION: "Plantation", FARM: "Ferme" } as const;

/** Pays du bien : fixe la devise des loyers et le centre de carte par défaut, avant le placement précis. */
const COUNTRIES = [
  { code: "CI", label: "Côte d'Ivoire", city: "Abidjan", currency: "XOF" as Currency, center: { lat: 5.345, lng: -4.024 } },
  { code: "FR", label: "France", city: "Paris", currency: "EUR" as Currency, center: { lat: 48.8566, lng: 2.3522 } },
];

type UnitDraft = { label: string; rooms: string; rent: string };
const STEPS = 4;
const digits = (t: string) => t.replace(/\D/g, "");
const grouped = (t: string) => (t ? Number(t).toLocaleString("fr-FR").replace(/\s/g, " ") : "");

/** Ajouter un bien (08-ProAjout) : type et nom, adresse, logements et loyers, photos. */
export default function NewAsset() {
  const insets = useSafeAreaInsets();
  const user = useUser();
  const [step, setStep] = useState(1);
  const [kind, setKind] = useState<RealEstateKind>();
  const [name, setName] = useState("");
  const [country, setCountry] = useState(COUNTRIES[0]!);
  const [address, setAddress] = useState("");
  const [city, setCity] = useState(COUNTRIES[0]!.city);
  const [purchase, setPurchase] = useState("");
  const [units, setUnits] = useState<UnitDraft[]>([{ label: "", rooms: "", rent: "" }]);
  const [photos, setPhotos] = useState<string[]>([]);

  const multi = kind === "BUILDING";
  const unitsOk = units.every((u) => Number(u.rent) > 0);
  const canContinue = step === 1 ? !!kind && name.trim().length > 1 : step === 2 ? address.trim().length > 2 && city.trim().length > 1 : step === 3 ? unitsOk : true;
  const currencyLabel = country.currency === "XOF" ? "FCFA" : "€";
  // L'euro se saisit en euros, stocké en centimes (unité mineure).
  const toMinor = (v: string) => Number(v || 0) * (country.currency === "XOF" ? 1 : 100);

  const pickPhotos = async (camera: boolean) => {
    const perm = camera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const res = camera
      ? await ImagePicker.launchCameraAsync({ quality: 0.7 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsMultipleSelection: true, selectionLimit: 8, quality: 0.7 });
    if (!res.canceled) setPhotos((p) => [...p, ...res.assets.map((a) => a.uri)].slice(0, 8));
  };

  const submit = () => {
    if (!kind) return;
    const id = `a-${Date.now().toString(36)}`;
    // Les champs propres à l'immobilier sont validés par le schéma du module.
    const details = RealEstateDetails.parse({ kind, purchasePrice: purchase ? toMinor(purchase) : undefined });
    const asset: Asset = {
      id,
      ownerId: user.id,
      type: "REAL_ESTATE",
      name: name.trim(),
      location: { address: address.trim(), city: city.trim(), country: country.code, ...country.center },
      details,
      currency: country.currency,
      createdAt: new Date().toISOString(),
    };
    const assetUnits: AssetUnit[] = units.map((u, i) => ({
      id: `${id}-u${i + 1}`,
      assetId: id,
      type: "DWELLING",
      label: u.label.trim() || (units.length === 1 ? REAL_ESTATE_KIND_LABEL[kind] : `Logement ${i + 1}`),
      details: RealEstateUnitDetails.parse({ rooms: Number(u.rooms) || 1, askingRent: toMinor(u.rent) }),
    }));
    actions.addAsset({ asset, units: assetUnits, photos });
    router.replace(`/bien/${id}`);
  };

  const setUnit = (i: number, patch: Partial<UnitDraft>) => setUnits((list) => list.map((u, j) => (j === i ? { ...u, ...patch } : u)));

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: color.surface }} behavior="padding">
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 12, paddingHorizontal: 24, paddingBottom: 140 }} keyboardShouldPersistTaps="handled">
        <RoundButton icon={step > 1 ? ChevronLeft : X} label={step > 1 ? "Étape précédente" : "Fermer"} onPress={() => (step > 1 ? setStep(step - 1) : router.back())} />
        <View style={{ flexDirection: "row", gap: 6, marginTop: 20 }}>
          {Array.from({ length: STEPS }, (_, i) => (
            <View key={i} style={{ flex: 1, height: 4, borderRadius: 4, backgroundColor: i < step ? color.mint : color.line }} />
          ))}
        </View>
        <Text variant="rowSubtitle" tone="inkMuted" style={{ marginTop: 10 }}>
          Étape {step} sur {STEPS}
        </Text>

        {step === 1 && (
          <>
            <Text variant="screenTitle" style={{ marginTop: 6 }} accessibilityRole="header">
              Quel type de bien ?
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 20 }}>
              {CHOICES.map((c) => {
                const soon = "soon" in c;
                const active = !soon && c.kind === kind;
                const Icon = c.icon;
                return (
                  <Pressable
                    key={c.kind}
                    disabled={soon}
                    onPress={() => {
                      if (soon) return;
                      setKind(c.kind as RealEstateKind);
                      if (c.kind !== "BUILDING") setUnits((u) => u.slice(0, 1));
                    }}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: active, disabled: soon }}
                    style={{
                      width: "47%",
                      flexGrow: 1,
                      height: 104,
                      borderRadius: radius.card,
                      backgroundColor: active ? color.mintTint : color.surfaceRaised,
                      borderWidth: 2,
                      borderColor: active ? color.mint : "transparent",
                      padding: 16,
                      justifyContent: "space-between",
                      opacity: soon ? 0.55 : 1,
                    }}
                  >
                    <Icon size={26} strokeWidth={1.8} color={active ? color.mintDeep : color.ink} />
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 4 }}>
                      <Text variant="rowTitle" numberOfLines={1} style={{ flexShrink: 1 }}>
                        {soon ? SOON_LABEL[c.kind as "PLANTATION" | "FARM"] : REAL_ESTATE_KIND_LABEL[c.kind as RealEstateKind]}
                      </Text>
                      {soon && (
                        <View style={{ backgroundColor: color.surfaceSoft, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
                          <Text variant="caption" tone="inkMuted">
                            Bientôt
                          </Text>
                        </View>
                      )}
                    </View>
                  </Pressable>
                );
              })}
            </View>
            <TextField label="Nom du bien" value={name} onChangeText={setName} placeholder="Ex. Villa Bingerville" autoCapitalize="words" />
          </>
        )}

        {step === 2 && (
          <>
            <Text variant="screenTitle" style={{ marginTop: 6 }} accessibilityRole="header">
              Où se trouve-t-il ?
            </Text>
            <View style={{ flexDirection: "row", gap: 8, marginTop: 20 }}>
              {COUNTRIES.map((c) => (
                <Chip
                  key={c.code}
                  active={c.code === country.code}
                  label={c.label}
                  onPress={() => {
                    setCountry(c);
                    setCity(c.city);
                  }}
                />
              ))}
            </View>
            <TextField label="Adresse ou quartier" value={address} onChangeText={setAddress} placeholder={country.code === "CI" ? "Ex. Riviera 3, rue des Jardins" : "Ex. 12 rue des Lilas"} />
            <TextField label="Ville" value={city} onChangeText={setCity} />
            <TextField
              label={`Prix d'achat (${currencyLabel}), facultatif`}
              value={grouped(purchase)}
              onChangeText={(t) => setPurchase(digits(t))}
              keyboardType="number-pad"
              hint="Sert à calculer la rentabilité. Il n'est visible que par vous."
            />
          </>
        )}

        {step === 3 && (
          <>
            <Text variant="screenTitle" style={{ marginTop: 6 }} accessibilityRole="header">
              {multi ? "Logements et loyers" : "Loyer"}
            </Text>
            <Text variant="rowSubtitle" tone="inkMuted" style={{ marginTop: 6 }}>
              Le loyer indiqué sera proposé à la création du bail.
            </Text>
            {units.map((u, i) => (
              <View key={i} style={{ marginTop: 16, padding: multi ? 16 : 0, borderRadius: radius.card, backgroundColor: multi ? color.surfaceRaised : "transparent" }}>
                {multi && (
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                    <Text variant="rowTitle">Logement {i + 1}</Text>
                    {units.length > 1 && (
                      <Pressable onPress={() => setUnits((list) => list.filter((_, j) => j !== i))} accessibilityLabel={`Retirer le logement ${i + 1}`} hitSlop={8}>
                        <X size={20} strokeWidth={1.8} color={color.inkMuted} />
                      </Pressable>
                    )}
                  </View>
                )}
                {multi && <TextField label="Nom" value={u.label} onChangeText={(t) => setUnit(i, { label: t })} placeholder={`Ex. Appartement A${i + 1}`} />}
                <View style={{ flexDirection: "row", gap: 12 }}>
                  <View style={{ width: 110 }}>
                    <TextField label="Pièces" value={u.rooms} onChangeText={(t) => setUnit(i, { rooms: digits(t) })} keyboardType="number-pad" placeholder="3" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <TextField label={`Loyer mensuel (${currencyLabel})`} value={grouped(u.rent)} onChangeText={(t) => setUnit(i, { rent: digits(t) })} keyboardType="number-pad" placeholder={country.currency === "XOF" ? "150 000" : "850"} />
                  </View>
                </View>
              </View>
            ))}
            {multi && (
              <View style={{ marginTop: 16 }}>
                <Button kind="soft" label="Ajouter un logement" onPress={() => setUnits((list) => [...list, { label: "", rooms: "", rent: list[list.length - 1]?.rent ?? "" }])} />
              </View>
            )}
          </>
        )}

        {step === 4 && (
          <>
            <Text variant="screenTitle" style={{ marginTop: 6 }} accessibilityRole="header">
              Photos du bien
            </Text>
            <Text variant="rowSubtitle" tone="inkMuted" style={{ marginTop: 6 }}>
              Facultatif. Elles vous aideront à suivre l'état du bien dans le temps.
            </Text>
            <View style={{ flexDirection: "row", gap: 12, marginTop: 20 }}>
              <View style={{ flex: 1 }}>
                <Button kind="soft" icon={Camera} label="Prendre" onPress={() => pickPhotos(true)} />
              </View>
              <View style={{ flex: 1 }}>
                <Button kind="soft" icon={ImagePlus} label="Galerie" onPress={() => pickPhotos(false)} />
              </View>
            </View>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 16 }}>
              {photos.map((uri) => (
                <View key={uri}>
                  <Image source={{ uri }} style={{ width: 96, height: 96, borderRadius: radius.md }} accessibilityLabel="Photo du bien" />
                  <Pressable
                    onPress={() => setPhotos((p) => p.filter((x) => x !== uri))}
                    accessibilityLabel="Retirer la photo"
                    style={{ position: "absolute", top: 4, right: 4, width: 26, height: 26, borderRadius: 13, backgroundColor: color.scrim, alignItems: "center", justifyContent: "center" }}
                  >
                    <X size={16} strokeWidth={2} color={color.onNight} />
                  </Pressable>
                </View>
              ))}
            </View>
          </>
        )}
      </ScrollView>

      <View style={{ position: "absolute", left: 24, right: 24, bottom: insets.bottom + 16 }}>
        <Button
          label={step < STEPS ? "Continuer" : photos.length ? "Ajouter le bien" : "Ajouter sans photo"}
          disabled={!canContinue}
          onPress={() => (step < STEPS ? setStep(step + 1) : submit())}
        />
      </View>
    </KeyboardAvoidingView>
  );
}
