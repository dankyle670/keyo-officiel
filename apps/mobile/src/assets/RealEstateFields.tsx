import { useState } from "react";
import { Pressable, View } from "react-native";
import { ChevronDown, ChevronRight, Minus, Plus, Trash2 } from "lucide-react-native";
import { layoutLabel, REAL_ESTATE_LABELS as L, roomsOf, type RealEstateDetails, type RealEstateKind, type RealEstateUnitDetails } from "@keyo/shared";
import { color, fontFamily, radius } from "@keyo/tokens";
import { Chip, Text, TextField, ToggleRow } from "@/ui";

/**
 * Fiche d'un bien immobilier : caractéristiques du bien et composition de chaque logement.
 * Utilisée à la création et à la modification ; chaque champ est facultatif et améliore l'estimation.
 */
export type PropertyDraft = Partial<Omit<RealEstateDetails, "kind" | "purchasePrice">>;
export type CompositionDraft = Partial<Omit<RealEstateUnitDetails, "askingRent" | "value" | "charges">>;

const TIER_HINT: Record<string, string> = {
  PRIME: "Cocody Riviera, Deux-Plateaux, Zone 4, Plateau",
  RESIDENTIAL: "Angré, Marcory, Bingerville, Palmeraie",
  POPULAR: "Yopougon, Abobo, Koumassi, Port-Bouët",
  OUTSKIRTS: "Anyama, Songon, villes de l'intérieur",
};

function Label({ children, hint }: { children: string; hint?: string }) {
  return (
    <View style={{ marginTop: 18, marginBottom: 8 }}>
      <Text variant="rowSubtitle" tone="ink" style={{ fontFamily: fontFamily.semibold }}>
        {children}
      </Text>
      {hint ? (
        <Text variant="caption" tone="inkMuted">
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

/** Choix unique en pastilles ; toucher la pastille active l'efface (réponse inconnue). */
function OneOf<T extends string>({ value, options, onChange }: { value?: T; options: Record<T, string>; onChange: (v: T | undefined) => void }) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      {(Object.entries(options) as [T, string][]).map(([k, label]) => (
        <Chip key={k} active={k === value} label={label} onPress={() => onChange(k === value ? undefined : k)} />
      ))}
    </View>
  );
}

function ManyOf<T extends string>({ value = [], options, onChange }: { value?: T[]; options: Partial<Record<T, string>>; onChange: (v: T[]) => void }) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      {(Object.entries(options) as [T, string][]).map(([k, label]) => {
        const on = value.includes(k);
        return <Chip key={k} active={on} label={label} onPress={() => onChange(on ? value.filter((x) => x !== k) : [...value, k])} />;
      })}
    </View>
  );
}

/** Compteur − valeur + (chambres, douches…). */
export function Stepper({ label, value, onChange, min = 0, max = 30 }: { label: string; value?: number; onChange: (v: number) => void; min?: number; max?: number }) {
  const n = value ?? 0;
  const btn = (Icon: typeof Plus, next: number, disabled: boolean, a11y: string) => (
    <Pressable
      onPress={() => onChange(next)}
      disabled={disabled}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      style={({ pressed }) => ({ width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: color.surfaceSoft, opacity: disabled ? 0.35 : pressed ? 0.6 : 1 })}
    >
      <Icon size={18} strokeWidth={1.8} color={color.ink} />
    </Pressable>
  );
  return (
    <View style={{ flexDirection: "row", alignItems: "center", minHeight: 52 }} accessible={false}>
      <Text variant="rowTitle" style={{ flex: 1 }}>
        {label}
      </Text>
      {btn(Minus, Math.max(min, n - 1), n <= min, `Retirer ${label.toLowerCase()}`)}
      <Text variant="rowTitle" style={{ width: 44, textAlign: "center", fontVariant: ["tabular-nums"] }} accessibilityLabel={`${label} : ${value === undefined ? "non renseigné" : n}`}>
        {value === undefined ? "–" : n}
      </Text>
      {btn(Plus, Math.min(max, n + 1), n >= max, `Ajouter ${label.toLowerCase()}`)}
    </View>
  );
}

const int = (t: string) => {
  const n = Number(t.replace(/\D/g, ""));
  return n > 0 ? n : undefined;
};

/** Caractéristiques du bien : quartier, âge, état, titre, accès, équipements communs. */
export function PropertyFields({ kind, ci, value, onChange, only }: { kind: RealEstateKind; ci: boolean; value: PropertyDraft; onChange: (v: PropertyDraft) => void; only?: "location" | "building" }) {
  const set = (patch: PropertyDraft) => onChange({ ...value, ...patch });
  const collective = kind === "BUILDING" || kind === "COURTYARD";
  const amenities = { ...L.amenities } as Partial<Record<keyof typeof L.amenities, string>>;
  if (kind !== "HOUSE") delete amenities.POOL;
  if (kind === "HOUSE" || kind === "COURTYARD") delete amenities.LIFT;
  return (
    <View>
      {only !== "building" && (
        <>
          <Label hint={ci ? undefined : "Situation du bien"}>Type de quartier</Label>
          <OneOf value={value.tier} options={L.tier} onChange={(tier) => set({ tier })} />
          {ci && value.tier ? (
            <Text variant="caption" tone="inkMuted" style={{ marginTop: 6 }}>
              {`Par exemple : ${TIER_HINT[value.tier]}`}
            </Text>
          ) : null}
        </>
      )}
      {only !== "location" && (
        <>
          <Label>Construit il y a</Label>
          <OneOf value={value.builtAge} options={L.builtAge} onChange={(builtAge) => set({ builtAge })} />
          <Label>État général</Label>
          <OneOf value={value.condition} options={L.condition} onChange={(condition) => set({ condition })} />
          <Label hint="Carrelage, menuiseries, cuisine, sanitaires.">Finitions</Label>
          <OneOf value={value.finish} options={L.finish} onChange={(finish) => set({ finish })} />
          {ci && (
            <>
              <Label>Document de propriété</Label>
              <OneOf value={value.legal} options={L.legal} onChange={(legal) => set({ legal })} />
            </>
          )}
          <Label>Permis de construire</Label>
          <OneOf value={value.permit} options={L.permit} onChange={(permit) => set({ permit })} />
          <Label>Voie d'accès</Label>
          <OneOf value={value.access} options={L.access} onChange={(access) => set({ access })} />
          <View style={{ flexDirection: "row", gap: 12 }}>
            {kind !== "APARTMENT" && (
              <View style={{ flex: 1 }}>
                <TextField label="Terrain (m²)" value={value.landM2 ? String(value.landM2) : ""} onChangeText={(t) => set({ landM2: int(t) })} keyboardType="number-pad" placeholder="500" />
              </View>
            )}
            {(collective || kind === "HOUSE" || kind === "COMMERCIAL") && (
              <View style={{ flex: 1 }}>
                <TextField label="Niveaux" hint="R+2 = 3 niveaux" value={value.floors ? String(value.floors) : ""} onChangeText={(t) => set({ floors: int(t) })} keyboardType="number-pad" placeholder="1" />
              </View>
            )}
          </View>
          <Label hint="Plusieurs choix possibles.">{collective ? "Équipements communs" : "Équipements"}</Label>
          <ManyOf value={value.amenities} options={amenities} onChange={(a) => set({ amenities: a })} />
          <Label hint="Plusieurs choix possibles.">Environnement</Label>
          <ManyOf value={value.surroundings} options={L.surroundings} onChange={(s) => set({ surroundings: s })} />
        </>
      )}
    </View>
  );
}

/** Composition d'un logement : pièces, eau, cuisine, surface, confort, compteurs. */
export function CompositionFields({ kind, value, onChange }: { kind: RealEstateKind; value: CompositionDraft; onChange: (v: CompositionDraft) => void }) {
  const set = (patch: CompositionDraft) => {
    const next = { ...value, ...patch };
    // Les pièces principales suivent la composition (chambres + salons).
    const rooms = roomsOf(next);
    onChange({ ...next, rooms });
  };
  const commercial = kind === "COMMERCIAL";
  return (
    <View>
      {!commercial && (
        <>
          <Stepper label="Chambres" value={value.bedrooms} onChange={(bedrooms) => set({ bedrooms })} />
          <Stepper label="Salons" value={value.livingRooms} onChange={(livingRooms) => set({ livingRooms })} max={10} />
          <Stepper label="Douches" value={value.bathrooms} onChange={(bathrooms) => set({ bathrooms })} />
        </>
      )}
      <Stepper label="Toilettes" value={value.toilets} onChange={(toilets) => set({ toilets })} />
      {(value.toilets ?? 0) > 0 && kind !== "HOUSE" && <OneOf value={value.toiletsPlace} options={L.toiletsPlace} onChange={(toiletsPlace) => set({ toiletsPlace })} />}
      {!commercial && (
        <>
          <Label>Cuisine</Label>
          <OneOf value={value.kitchen} options={L.kitchen} onChange={(kitchen) => set({ kitchen })} />
        </>
      )}
      <View style={{ flexDirection: "row", gap: 12 }}>
        <View style={{ flex: 1 }}>
          <TextField label="Surface (m²)" value={value.surfaceM2 ? String(value.surfaceM2) : ""} onChangeText={(t) => set({ surfaceM2: int(t) })} keyboardType="number-pad" placeholder="60" />
        </View>
        {kind !== "HOUSE" && (
          <View style={{ flex: 1 }}>
            <TextField label="Étage" hint="0 = rez-de-chaussée" value={value.floor === undefined ? "" : String(value.floor)} onChangeText={(t) => set({ floor: t.trim() === "" ? undefined : Number(t.replace(/\D/g, "")) || 0 })} keyboardType="number-pad" placeholder="0" />
          </View>
        )}
      </View>
      <Stepper label="Climatiseurs" value={value.acUnits} onChange={(acUnits) => set({ acUnits })} />
      {!commercial && <ToggleRow title="Meublé" value={!!value.furnished} onChange={(furnished) => set({ furnished })} />}
      <ToggleRow title={kind === "HOUSE" ? "Terrasse" : "Balcon ou terrasse"} value={!!value.balcony} onChange={(balcony) => set({ balcony })} />
      <Label>Compteur d'électricité (CIE)</Label>
      <OneOf value={value.electricityMeter} options={L.meter} onChange={(electricityMeter) => set({ electricityMeter })} />
      <Label>Compteur d'eau (SODECI)</Label>
      <OneOf value={value.waterMeter} options={L.meter} onChange={(waterMeter) => set({ waterMeter })} />
    </View>
  );
}

/**
 * Carte d'un logement, repliable : en-tête avec le nom, la typologie et le loyer ; détail au toucher.
 * `children` : champs propres à l'écran (nom, loyer, valeur…).
 */
export function UnitCard({
  title,
  summary,
  defaultOpen,
  onRemove,
  removeMuted,
  children,
}: {
  title: string;
  summary?: string;
  defaultOpen?: boolean;
  onRemove?: () => void;
  removeMuted?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(!!defaultOpen);
  const Chevron = open ? ChevronDown : ChevronRight;
  return (
    <View style={{ marginTop: 14, borderRadius: radius.card, backgroundColor: color.surfaceRaised, overflow: "hidden" }}>
      <Pressable onPress={() => setOpen((o) => !o)} accessibilityRole="button" accessibilityState={{ expanded: open }} style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 10, padding: 16, opacity: pressed ? 0.7 : 1 })}>
        <Chevron size={18} strokeWidth={1.8} color={color.inkMuted} />
        <View style={{ flex: 1 }}>
          <Text variant="rowTitle" numberOfLines={1}>
            {title}
          </Text>
          {summary ? (
            <Text variant="rowSubtitle" tone="inkMuted" numberOfLines={2}>
              {summary}
            </Text>
          ) : null}
        </View>
        {onRemove ? (
          <Pressable onPress={onRemove} hitSlop={10} accessibilityRole="button" accessibilityLabel={`Retirer ${title}`}>
            <Trash2 size={20} strokeWidth={1.8} color={removeMuted ? color.track : color.danger} />
          </Pressable>
        ) : null}
      </Pressable>
      {open ? <View style={{ paddingHorizontal: 16, paddingBottom: 16 }}>{children}</View> : null}
    </View>
  );
}

/** Résumé d'un logement : « Chambre-salon (1 douche) · 60 m² · 2e étage ». */
export function compositionSummary(d: CompositionDraft) {
  const parts = [layoutLabel(d)];
  if (d.surfaceM2) parts.push(`${d.surfaceM2} m²`);
  if (d.floor !== undefined) parts.push(d.floor === 0 ? "rez-de-chaussée" : `${d.floor}${d.floor === 1 ? "er" : "e"} étage`);
  if (d.furnished) parts.push("meublé");
  return parts.filter(Boolean).join(" · ");
}
