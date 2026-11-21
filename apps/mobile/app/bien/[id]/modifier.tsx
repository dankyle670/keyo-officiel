import { useState } from "react";
import { Alert, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { cap, formatShare, MINOR_UNITS, profileOf, sharesOf, type Holding, type RealEstateKind } from "@keyo/shared";
import { today } from "@/data/period";
import { familyMembers, latestAppraisal } from "@/data/selectors";
import { useUser } from "@/data/session";
import { actions, useOwnerState } from "@/data/store";
import { CompositionFields, compositionSummary, PropertyFields, UnitCard, type CompositionDraft, type PropertyDraft } from "@/assets/RealEstateFields";
import { Button, Chip, SectionTitle, Segmented, SubScreen, Text, TextField } from "@/ui";

type UnitDraft = { id?: string; label: string; measure: string; rent: string; charges: string; value: string; comp: CompositionDraft; occupied: boolean; leaseId?: string };

/** Champs de composition d'un logement (tout sauf les montants, gérés à part). */
const compOf = (d: Record<string, unknown>): CompositionDraft => {
  const { askingRent: _r, value: _v, charges: _c, ...rest } = d;
  return rest as CompositionDraft;
};

const digits = (t: string) => t.replace(/\D/g, "");
const grouped = (t: string) => (t ? Number(t).toLocaleString("fr-FR").replace(/\s/g, " ") : "");

/**
 * Modifier un bien : tout ce qui a été saisi à la création reste modifiable (sous-type, nom, adresse,
 * caractéristiques du bâtiment, composition et loyer de chaque logement, valeur, propriété).
 */
export default function EditAsset() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const state = useOwnerState((s) => s);
  const asset = state.assets.find((a) => a.id === id);
  const profile = profileOf(asset?.type ?? "REAL_ESTATE");
  const factor = 10 ** MINOR_UNITS[asset?.currency ?? "XOF"];
  const key = profile.measure?.key;
  const currentLeases = state.agreements.filter((g) => g.assetId === id && (!g.endDate || g.endDate >= today()));
  const occupied = new Set(currentLeases.map((g) => g.unitId));

  const [name, setName] = useState(asset?.name ?? "");
  const [kind, setKind] = useState(String(asset?.details.kind ?? ""));
  const [address, setAddress] = useState(asset?.location.address ?? "");
  const [city, setCity] = useState(asset?.location.city ?? "");
  const realEstate = asset?.type === "REAL_ESTATE";
  const [property, setProperty] = useState<PropertyDraft>(() => {
    const { kind: _k, purchasePrice: _p, ...rest } = (asset?.details ?? {}) as Record<string, unknown>;
    return rest as PropertyDraft;
  });
  const [purchase, setPurchase] = useState(typeof asset?.details.purchasePrice === "number" ? String(asset.details.purchasePrice / factor) : "");
  const [units, setUnits] = useState<UnitDraft[]>(() =>
    state.units
      .filter((u) => u.assetId === id)
      .map((u) => ({
        id: u.id,
        label: u.label,
        measure: key && typeof u.details[key] === "number" ? String(u.details[key]).replace(".", ",") : "",
        rent: (() => {
          const g = currentLeases.find((x) => x.unitId === u.id);
          if (g) return String(g.periodicAmount.amount / factor);
          return typeof u.details.askingRent === "number" ? String(u.details.askingRent / factor) : "";
        })(),
        value: typeof u.details.value === "number" ? String(u.details.value / factor) : "",
        charges: typeof u.details.charges === "number" ? String(u.details.charges / factor) : "",
        comp: compOf(u.details),
        occupied: occupied.has(u.id),
        ...(() => {
          const g = currentLeases.find((x) => x.unitId === u.id);
          return g ? { leaseId: g.id } : {};
        })(),
      })),
  );
  const [removed, setRemoved] = useState<string[]>([]);
  const user = useUser();
  const members = familyMembers(state);
  const [holding, setHolding] = useState<Holding>(asset?.holding ?? "PERSONAL");
  const [value, setValue] = useState(asset?.value ? String(asset.value.amount / factor) : "");
  /** Parts saisies en pour cent (texte, virgule acceptée), par détenteur. */
  const [shares, setShares] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    if (asset) for (const h of sharesOf(asset, state.shares)) init[h.holderId] = String(h.sharePermille / 10).replace(".", ",");
    return init;
  });

  if (!asset) {
    return (
      <SubScreen title="Bien introuvable">
        <Text variant="body" tone="inkMuted">
          Ce bien n'existe plus sur ce téléphone.
        </Text>
      </SubScreen>
    );
  }

  const holders = [{ id: user.id, name: "Vous" }, ...members.map((m) => ({ id: m.id, name: `${m.firstName} ${m.lastName}`.trim() }))];
  const permille = (t: string | undefined) => Math.round(Number((t ?? "").replace(",", ".")) * 10) || 0;
  const shareSum = holders.reduce((n, h) => n + permille(shares[h.id]), 0);
  const sharesOk = holding === "PERSONAL" || shareSum === 1000;
  const equalSplit = () => {
    const n = holders.length;
    const base = Math.floor(1000 / n);
    setShares(Object.fromEntries(holders.map((h, i) => [h.id, String((base + (i === 0 ? 1000 - base * n : 0)) / 10).replace(".", ",")])));
  };
  const currencyLabel = asset.currency === "XOF" ? "FCFA" : asset.currency === "EUR" ? "€" : asset.currency;
  const ok = name.trim().length > 1 && units.length > 0 && units.every((u) => u.label.trim()) && sharesOk;
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
      details: { ...(realEstate ? property : {}), kind, purchasePrice: purchase ? Number(purchase) * factor : undefined },
      value: value ? Number(value) * factor : null,
    });
    actions.setHolding(asset.id, holding, holders.map((h) => ({ holderId: h.id, sharePermille: permille(shares[h.id]) })));
    removed.forEach((uid) => actions.deleteUnit(uid));
    units.forEach((u) => {
      const money = { askingRent: u.rent ? Number(u.rent) * factor : undefined, value: u.value ? Number(u.value) * factor : undefined };
      const details = realEstate ? { ...u.comp, ...money, charges: u.charges ? Number(u.charges) * factor : undefined } : { ...measureValue(u.measure), ...money };
      if (u.id) actions.updateUnit(u.id, { label: u.label.trim(), details });
      else actions.addUnit(asset.id, u.label.trim(), details);
      // Logement occupé : le montant saisi est celui du contrat en cours.
      const g = u.leaseId ? currentLeases.find((x) => x.id === u.leaseId) : undefined;
      if (g && u.rent && Number(u.rent) * factor !== g.periodicAmount.amount) actions.updateLease(g.id, { amount: Number(u.rent) * factor });
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
      {realEstate && (
        <>
          <SectionTitle>Situation</SectionTitle>
          <PropertyFields kind={kind as RealEstateKind} ci={asset.location.country === "CI"} value={property} onChange={setProperty} only="location" />
          <SectionTitle>{kind === "APARTMENT" ? "L'immeuble" : "Le bâtiment"}</SectionTitle>
          <Text variant="rowSubtitle" tone="inkMuted" style={{ marginTop: 4 }}>
            Chaque réponse rend l'estimation de la valeur plus précise.
          </Text>
          <PropertyFields kind={kind as RealEstateKind} ci={asset.location.country === "CI"} value={property} onChange={setProperty} only="building" />
        </>
      )}

      <SectionTitle>Valeur</SectionTitle>
      <TextField label={`Prix d'achat (${currencyLabel}), facultatif`} value={grouped(purchase)} onChangeText={(t) => setPurchase(digits(t))} keyboardType="number-pad" hint="Sert au calcul de la rentabilité." />

      <TextField label={`Valeur estimée aujourd'hui (${currencyLabel}), facultatif`} value={grouped(value)} onChangeText={(t) => setValue(digits(t))} keyboardType="number-pad" hint="Sert au calcul du patrimoine. À défaut, le prix d'achat est utilisé." />
      {latestAppraisal(state, asset.id) && (
        <View style={{ flexDirection: "row", marginTop: 10 }}>
          <Chip
            active={false}
            label="Reprendre la dernière expertise"
            onPress={() => {
              const r = latestAppraisal(state, asset.id)!.result;
              setValue(String(r.value.amount / factor));
              setUnits((list) => list.map((u) => {
                const v = r.perUnit.find((x) => x.unitId === u.id)?.value.amount;
                return v ? { ...u, value: String(v / factor) } : u;
              }));
            }}
          />
        </View>
      )}

      <SectionTitle>Propriété</SectionTitle>
      <Segmented
        value={holding}
        onChange={(v) => {
          setHolding(v);
          if (v === "FAMILY" && holders.every((h) => !permille(shares[h.id]) || h.id === user.id)) equalSplit();
        }}
        options={[
          { value: "PERSONAL", label: "Personnel" },
          { value: "FAMILY", label: "Famille" },
        ]}
      />
      {holding === "FAMILY" && (
        <>
          {members.length === 0 && (
            <Text variant="rowSubtitle" tone="inkMuted">
              Invitez d'abord vos proches depuis Profil, puis « Famille et patrimoine ».
            </Text>
          )}
          {holders.map((h) => (
            <View key={h.id} style={{ flexDirection: "row", alignItems: "flex-end", gap: 12 }}>
              <Text variant="rowTitle" style={{ flex: 1, paddingBottom: 18 }} numberOfLines={1}>
                {h.name}
              </Text>
              <View style={{ width: 120 }}>
                <TextField label="Part (%)" value={shares[h.id] ?? ""} onChangeText={(t) => setShares((s) => ({ ...s, [h.id]: t.replace(/[^\d,]/g, "") }))} keyboardType="decimal-pad" placeholder="0" />
              </View>
            </View>
          ))}
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 12 }}>
            <Text variant="rowSubtitle" tone={shareSum === 1000 ? "mintDeep" : "danger"}>
              Total {formatShare(shareSum)}
              {shareSum === 1000 ? "" : " : il faut 100 %"}
            </Text>
            <Chip active={false} label="Parts égales" onPress={equalSplit} />
          </View>
        </>
      )}

      <SectionTitle>{cap(profile.unit.many)}</SectionTitle>
      <Text variant="rowSubtitle" tone="inkMuted" style={{ marginTop: 4 }}>
        Pour {profile.unit.feminine ? "une" : "un"} {profile.unit.one} occupé{profile.unit.feminine ? "e" : ""}, le montant modifie le contrat en cours, dès ce mois-ci si rien n'a été payé. Pour {profile.unit.feminine ? "une" : "un"} {profile.unit.one} libre, c'est le montant proposé au prochain {profile.occupant.one}.
      </Text>
      {units.map((u, i) => {
        const state_ = u.occupied ? `occupé${profile.unit.feminine ? "e" : ""}` : u.id ? "libre" : "nouveau";
        return (
          <UnitCard
            key={u.id ?? `new-${i}`}
            title={u.label.trim() || `${cap(profile.unit.one)} ${i + 1}`}
            summary={[cap(state_), realEstate ? compositionSummary(u.comp) : "", u.rent ? `${grouped(u.rent)} ${currencyLabel}` : ""].filter(Boolean).join(" · ")}
            defaultOpen={units.length === 1 || !u.id}
            onRemove={() => remove(i)}
            removeMuted={u.occupied}
          >
            <TextField label={asset.type === "VEHICLE" ? "Modèle et immatriculation" : "Nom"} value={u.label} onChangeText={(t) => setUnit(i, { label: t })} />
            {realEstate ? (
              <CompositionFields kind={kind as RealEstateKind} value={u.comp} onChange={(comp) => setUnit(i, { comp })} />
            ) : (
              profile.measure && (
                <View style={{ width: 130 }}>
                  <TextField label={profile.measure.label} value={u.measure} onChangeText={(t) => setUnit(i, { measure: t.replace(/[^\d,]/g, "") })} keyboardType="decimal-pad" />
                </View>
              )
            )}
            <View style={{ flexDirection: "row", gap: 12 }}>
              <View style={{ flex: 1 }}>
                <TextField label={u.occupied ? `${cap(profile.amount)} en cours (${currencyLabel})` : `${cap(profile.amount)} demandé (${currencyLabel})`} value={grouped(u.rent)} onChangeText={(t) => setUnit(i, { rent: digits(t) })} keyboardType="number-pad" />
              </View>
              {realEstate && (
                <View style={{ flex: 1 }}>
                  <TextField label={`Charges (${currencyLabel})`} hint="Facultatif" value={grouped(u.charges)} onChangeText={(t) => setUnit(i, { charges: digits(t) })} keyboardType="number-pad" />
                </View>
              )}
            </View>
            <TextField label={`Valeur de ${profile.unit.feminine ? "la" : "ce"} ${profile.unit.one} (${currencyLabel}), facultatif`} value={grouped(u.value)} onChangeText={(t) => setUnit(i, { value: digits(t) })} keyboardType="number-pad" />
          </UnitCard>
        );
      })}
      <View style={{ marginTop: 16 }}>
        <Button
          kind="soft"
          label={`Ajouter ${profile.unit.feminine ? "une" : "un"} ${profile.unit.one}`}
          onPress={() => setUnits((list) => {
            const last = list[list.length - 1];
            return [...list, { label: `${cap(profile.unit.one)} ${list.length + 1}`, measure: last?.measure ?? "", rent: last?.rent ?? "", charges: last?.charges ?? "", value: "", comp: { ...(last?.comp ?? {}) }, occupied: false }];
          })}
        />
      </View>
    </SubScreen>
  );
}
