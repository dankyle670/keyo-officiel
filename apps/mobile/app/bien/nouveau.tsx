import { useState } from "react";
import { Image, KeyboardAvoidingView, Pressable, ScrollView, View } from "react-native";
import { router } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Building2, Camera, Car, ChevronLeft, ImagePlus, Sprout, Store, Tractor, X, type LucideIcon } from "lucide-react-native";
import { ASSET_PROFILES, ASSET_TYPE_ORDER, cap, DETAILS_SCHEMA, GenericUnitDetails, type Asset, type AssetType, type AssetUnit, type Currency } from "@keyo/shared";
import { color, radius } from "@keyo/tokens";
import { useUser } from "@/data/session";
import { actions } from "@/data/store";
import { Button, Chip, RoundButton, Text, TextField } from "@/ui";

const TYPE_ICON: Record<AssetType, LucideIcon> = { REAL_ESTATE: Building2, PLANTATION: Sprout, FARM: Tractor, VEHICLE: Car, SHOP: Store };
const TYPE_HINT: Record<AssetType, string> = {
  REAL_ESTATE: "Appartement, villa, immeuble",
  PLANTATION: "Cacao, hévéa, anacarde",
  FARM: "Volaille, porcs, poissons",
  VEHICLE: "Taxi, VTC, moto-taxi",
  SHOP: "Boutique, maquis, salon",
};
/** Une seule unité pour ces sous-types (une maison, un appartement). */
const SINGLE_UNIT_KINDS = new Set(["APARTMENT", "HOUSE"]);

/** Pays du bien : fixe la devise des loyers et le centre de carte par défaut, avant le placement précis. */
const COUNTRIES = [
  { code: "CI", label: "Côte d'Ivoire", city: "Abidjan", currency: "XOF" as Currency, center: { lat: 5.345, lng: -4.024 } },
  { code: "FR", label: "France", city: "Paris", currency: "EUR" as Currency, center: { lat: 48.8566, lng: 2.3522 } },
];

type UnitDraft = { label: string; measure: string; rent: string };
const STEPS = 4;
const digits = (t: string) => t.replace(/\D/g, "");
const grouped = (t: string) => (t ? Number(t).toLocaleString("fr-FR").replace(/\s/g, " ") : "");

/** Ajouter un bien (08-ProAjout) : type et nom, adresse, logements et loyers, photos. */
export default function NewAsset() {
  const insets = useSafeAreaInsets();
  const user = useUser();
  const [step, setStep] = useState(1);
  const [type, setType] = useState<AssetType>();
  const [kind, setKind] = useState<string>();
  const [name, setName] = useState("");
  const [country, setCountry] = useState(COUNTRIES[0]!);
  const [address, setAddress] = useState("");
  const [city, setCity] = useState(COUNTRIES[0]!.city);
  const [purchase, setPurchase] = useState("");
  const [units, setUnits] = useState<UnitDraft[]>([{ label: "", measure: "", rent: "" }]);
  const [photos, setPhotos] = useState<string[]>([]);

  const profile = ASSET_PROFILES[type ?? "REAL_ESTATE"];
  const multi = !!kind && !SINGLE_UNIT_KINDS.has(kind);
  const unitsOk = units.every((u) => Number(u.rent) > 0);
  const canContinue = step === 1 ? !!type && !!kind && name.trim().length > 1 : step === 2 ? address.trim().length > 2 && city.trim().length > 1 : step === 3 ? unitsOk : true;
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
    if (!kind || !type) return;
    const id = `a-${Date.now().toString(36)}`;
    // Les champs propres au type sont validés par le schéma de son module.
    const details = (DETAILS_SCHEMA[type] ?? DETAILS_SCHEMA.REAL_ESTATE!).parse({ kind, purchasePrice: purchase ? toMinor(purchase) : undefined }) as Record<string, unknown>;
    const key = profile.measure?.key;
    const asset: Asset = {
      id,
      ownerId: user.id,
      type,
      name: name.trim(),
      location: { address: address.trim(), city: city.trim(), country: country.code, ...country.center },
      details,
      currency: country.currency,
      createdAt: new Date().toISOString(),
    };
    const assetUnits: AssetUnit[] = units.map((u, i) => ({
      id: `${id}-u${i + 1}`,
      assetId: id,
      type: type === "REAL_ESTATE" ? "DWELLING" : type,
      label: u.label.trim() || (units.length === 1 ? profile.kinds[kind] ?? cap(profile.unit.one) : `${cap(profile.unit.one)} ${i + 1}`),
      details: GenericUnitDetails.parse({ ...(key && Number(u.measure.replace(",", ".")) > 0 ? { [key]: key === "areaHa" || key === "surfaceM2" ? Number(u.measure.replace(",", ".")) : Math.round(Number(u.measure)) } : {}), askingRent: toMinor(u.rent) }),
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
              {ASSET_TYPE_ORDER.map((t) => {
                const active = t === type;
                const Icon = TYPE_ICON[t];
                return (
                  <Pressable
                    key={t}
                    onPress={() => {
                      setType(t);
                      setKind(undefined);
                      setUnits((u) => u.slice(0, 1));
                    }}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: active }}
                    style={{
                      width: "47%",
                      flexGrow: 1,
                      minHeight: 104,
                      borderRadius: radius.card,
                      backgroundColor: active ? color.mintTint : color.surfaceRaised,
                      borderWidth: 2,
                      borderColor: active ? color.mint : "transparent",
                      padding: 16,
                      justifyContent: "space-between",
                      gap: 10,
                    }}
                  >
                    <Icon size={26} strokeWidth={1.8} color={active ? color.mintDeep : color.ink} />
                    <View>
                      <Text variant="rowTitle" numberOfLines={1}>
                        {ASSET_PROFILES[t].label}
                      </Text>
                      <Text variant="caption" tone="inkMuted" numberOfLines={1}>
                        {TYPE_HINT[t]}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
            {type && (
              <>
                <Text variant="rowSubtitle" tone="inkMuted" style={{ marginTop: 22 }}>
                  Précisez
                </Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
                  {Object.entries(profile.kinds).map(([k, label]) => (
                    <Chip
                      key={k}
                      active={k === kind}
                      label={label}
                      onPress={() => {
                        setKind(k);
                        if (SINGLE_UNIT_KINDS.has(k)) setUnits((u) => u.slice(0, 1));
                      }}
                    />
                  ))}
                </View>
              </>
            )}
            <TextField label="Nom" value={name} onChangeText={setName} placeholder={type === "PLANTATION" ? "Ex. Plantation Agboville" : type === "VEHICLE" ? "Ex. Taxi Toyota Corolla" : type === "FARM" ? "Ex. Ferme de Dabou" : type === "SHOP" ? "Ex. Boutique Adjamé" : "Ex. Villa Bingerville"} autoCapitalize="words" />
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
              {multi ? `${cap(profile.unit.many)} et ${profile.amount}s` : cap(profile.amount)}
            </Text>
            <Text variant="rowSubtitle" tone="inkMuted" style={{ marginTop: 6 }}>
              Le montant indiqué sera proposé à la création du {profile.agreement.one}.
            </Text>
            {units.map((u, i) => (
              <View key={i} style={{ marginTop: 16, padding: multi ? 16 : 0, borderRadius: radius.card, backgroundColor: multi ? color.surfaceRaised : "transparent" }}>
                {multi && (
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                    <Text variant="rowTitle">
                      {cap(profile.unit.one)} {i + 1}
                    </Text>
                    {units.length > 1 && (
                      <Pressable onPress={() => setUnits((list) => list.filter((_, j) => j !== i))} accessibilityLabel={`Retirer ${profile.unit.one} ${i + 1}`} hitSlop={8}>
                        <X size={20} strokeWidth={1.8} color={color.inkMuted} />
                      </Pressable>
                    )}
                  </View>
                )}
                {(multi || type === "VEHICLE") && (
                  <TextField
                    label={type === "VEHICLE" ? "Modèle et immatriculation" : "Nom"}
                    value={u.label}
                    onChangeText={(t) => setUnit(i, { label: t })}
                    placeholder={type === "VEHICLE" ? "Ex. Corolla, 1234 AB 01" : type === "PLANTATION" ? `Ex. Parcelle ${i + 1}` : `Ex. ${cap(profile.unit.one)} ${i + 1}`}
                  />
                )}
                <View style={{ flexDirection: "row", gap: 12 }}>
                  {profile.measure && (
                    <View style={{ width: 130 }}>
                      <TextField label={profile.measure.label} value={u.measure} onChangeText={(t) => setUnit(i, { measure: t.replace(/[^\d,]/g, "") })} keyboardType="decimal-pad" placeholder={profile.measure.key === "areaHa" ? "4,5" : "3"} />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <TextField label={`${cap(profile.amount)} mensuel (${currencyLabel})`} value={grouped(u.rent)} onChangeText={(t) => setUnit(i, { rent: digits(t) })} keyboardType="number-pad" placeholder={country.currency === "XOF" ? "150 000" : "850"} />
                  </View>
                </View>
              </View>
            ))}
            {multi && (
              <View style={{ marginTop: 16 }}>
                <Button kind="soft" label={`Ajouter ${profile.unit.feminine ? "une" : "un"} ${profile.unit.one}`} onPress={() => setUnits((list) => [...list, { label: "", measure: "", rent: list[list.length - 1]?.rent ?? "" }])} />
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
