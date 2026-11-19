import { useState } from "react";
import { KeyboardAvoidingView, Pressable, ScrollView, TextInput, View, type TextInputProps } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Building, Building2, ChevronLeft, House, Sprout, Store, Tractor, type LucideIcon } from "lucide-react-native";
import { RealEstateDetails, RealEstateUnitDetails, REAL_ESTATE_KIND_LABEL, type Asset, type AssetUnit, type RealEstateKind } from "@keyo/shared";
import { color, fontFamily, radius } from "@keyo/tokens";
import { owner } from "@/data/mock";
import { actions } from "@/data/store";
import { Button, RoundButton, Text } from "@/ui";

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

// Centre d'Abidjan en attendant le choix de la position sur la carte (géocodage Mapbox).
const ABIDJAN = { lat: 5.345, lng: -4.024 };

/** Ajouter un bien (08-ProAjout) : type et nom, puis adresse, puis logements et loyer. */
export default function NewAsset() {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState(1);
  const [kind, setKind] = useState<RealEstateKind>();
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("Abidjan");
  const [unitCount, setUnitCount] = useState(1);
  const [rooms, setRooms] = useState("");
  const [rent, setRent] = useState("");

  const rentAmount = Number(rent.replace(/\D/g, ""));
  const canContinue =
    step === 1 ? !!kind && name.trim().length > 1 : step === 2 ? address.trim().length > 2 && city.trim().length > 1 : unitCount > 0 && rentAmount > 0;

  const submit = () => {
    if (!kind) return;
    const id = `a-${Date.now()}`;
    // Les champs propres à l'immobilier sont validés par le schéma du module.
    const details = RealEstateDetails.parse({ kind });
    const asset: Asset = {
      id,
      ownerId: owner.id,
      type: "REAL_ESTATE",
      name: name.trim(),
      location: { address: address.trim(), city: city.trim(), country: "CI", ...ABIDJAN },
      details,
      currency: owner.displayCurrency,
      createdAt: new Date().toISOString(),
    };
    const units: AssetUnit[] = Array.from({ length: unitCount }, (_, i) => ({
      id: `${id}-u${i + 1}`,
      assetId: id,
      type: "DWELLING",
      label: unitCount === 1 ? "Logement" : `Logement ${i + 1}`,
      details: RealEstateUnitDetails.parse({ rooms: Number(rooms) || 1, askingRent: rentAmount }),
    }));
    actions.addAsset({ asset, units });
    router.replace(`/bien/${id}`);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: color.surface }} behavior="padding">
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 12, paddingHorizontal: 24, paddingBottom: 140 }} keyboardShouldPersistTaps="handled">
        <RoundButton icon={ChevronLeft} label="Retour" onPress={() => (step > 1 ? setStep(step - 1) : router.back())} />
        <View style={{ flexDirection: "row", gap: 6, marginTop: 20 }}>
          {[1, 2, 3].map((n) => (
            <View key={n} style={{ flex: 1, height: 4, borderRadius: 4, backgroundColor: n <= step ? color.mint : color.line }} />
          ))}
        </View>
        <Text variant="rowSubtitle" tone="inkMuted" style={{ marginTop: 10 }}>
          Étape {step} sur 3
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
                    onPress={() => !soon && setKind(c.kind as RealEstateKind)}
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
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                      <Text variant="rowTitle">{soon ? SOON_LABEL[c.kind as "PLANTATION" | "FARM"] : REAL_ESTATE_KIND_LABEL[c.kind as RealEstateKind]}</Text>
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
            <Field label="Nom du bien" value={name} onChangeText={setName} placeholder="Ex. Villa Bingerville" autoCapitalize="words" />
          </>
        )}

        {step === 2 && (
          <>
            <Text variant="screenTitle" style={{ marginTop: 6 }} accessibilityRole="header">
              Où se trouve-t-il ?
            </Text>
            <Field label="Adresse ou quartier" value={address} onChangeText={setAddress} placeholder="Ex. Riviera 3, rue des Jardins" />
            <Field label="Ville" value={city} onChangeText={setCity} />
            <Text variant="rowSubtitle" tone="inkMuted" style={{ marginTop: 12 }}>
              Vous pourrez placer le bien précisément sur la carte ensuite.
            </Text>
          </>
        )}

        {step === 3 && (
          <>
            <Text variant="screenTitle" style={{ marginTop: 6 }} accessibilityRole="header">
              Logements et loyer
            </Text>
            <Text variant="rowSubtitle" tone="inkMuted" style={{ marginTop: 24 }}>
              Nombre de logements
            </Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 16, marginTop: 8 }}>
              <Stepper label="Retirer un logement" sign="−" onPress={() => setUnitCount(Math.max(1, unitCount - 1))} />
              <Text variant="title" tabular style={{ minWidth: 32, textAlign: "center" }}>
                {unitCount}
              </Text>
              <Stepper label="Ajouter un logement" sign="+" onPress={() => setUnitCount(Math.min(50, unitCount + 1))} />
            </View>
            <Field label="Pièces par logement" value={rooms} onChangeText={(t) => setRooms(t.replace(/\D/g, ""))} keyboardType="number-pad" placeholder="Ex. 3" />
            <Field
              label="Loyer mensuel par logement (FCFA)"
              value={rent ? rentAmount.toLocaleString("fr-FR") : ""}
              onChangeText={(t) => setRent(t.replace(/\D/g, ""))}
              keyboardType="number-pad"
              placeholder="Ex. 150 000"
            />
          </>
        )}
      </ScrollView>

      <View style={{ position: "absolute", left: 24, right: 24, bottom: insets.bottom + 16 }}>
        <Button label={step < 3 ? "Continuer" : "Ajouter le bien"} disabled={!canContinue} onPress={() => (step < 3 ? setStep(step + 1) : submit())} />
      </View>
    </KeyboardAvoidingView>
  );
}

function Field({ label, ...props }: TextInputProps & { label: string }) {
  return (
    <View style={{ marginTop: 24, gap: 8 }}>
      <Text variant="rowSubtitle" tone="inkMuted">
        {label}
      </Text>
      <TextInput
        {...props}
        accessibilityLabel={label}
        placeholderTextColor={color.inkMuted}
        style={{ height: 56, borderRadius: 999, backgroundColor: color.surfaceRaised, paddingHorizontal: 20, fontFamily: fontFamily.medium, fontSize: 16, color: color.ink }}
      />
    </View>
  );
}

function Stepper({ sign, label, onPress }: { sign: string; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={{ width: 48, height: 48, borderRadius: 48, backgroundColor: color.surfaceSoft, alignItems: "center", justifyContent: "center" }}>
      <Text variant="title">{sign}</Text>
    </Pressable>
  );
}
