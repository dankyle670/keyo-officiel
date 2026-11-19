import { useMemo } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Bot, FileCheck2, FileQuestion } from "lucide-react-native";
import { cap, CONFIDENCE_LABEL, formatShare, profileOf, valueAsset } from "@keyo/shared";
import { color, radius } from "@keyo/tokens";
import { askAgent } from "@/agent/navigation";
import { today } from "@/data/period";
import { assetHolders } from "@/data/selectors";
import { useUser } from "@/data/session";
import { actions, useOwnerState } from "@/data/store";
import { Amount, AmountList, Button, IconCircle, ListRow, SectionTitle, Status, SubScreen, Text } from "@/ui";

const CONF_TONE = { LOW: "late", MEDIUM: "info", HIGH: "paid" } as const;

/**
 * Évaluation d'un bien, globale et par unité : estimation déterministe (revenu, prix d'achat),
 * fourchette et fiabilité selon les documents. L'agent peut l'affiner à partir des pièces jointes.
 */
export default function Valuation() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const user = useUser();
  const state = useOwnerState((s) => s);
  const asset = state.assets.find((a) => a.id === id);
  const v = useMemo(() => (asset ? valueAsset({ asset, units: state.units, agreements: state.agreements, documents: state.documents, today: today() }) : null), [state, asset]);

  if (!asset || !v) {
    return (
      <SubScreen title="Bien introuvable">
        <Text variant="body" tone="inkMuted">
          Ce bien n'existe plus sur ce téléphone.
        </Text>
      </SubScreen>
    );
  }
  const profile = profileOf(asset.type);
  const holders = asset.holding === "FAMILY" ? assetHolders(state, asset.id, { id: user.id, name: "Vous" }) : [];
  const base = v.declared ?? v.suggested;
  const applied = !!v.suggested && v.declared?.amount === v.suggested.amount;

  const apply = () => {
    if (!v.suggested) return;
    actions.updateAsset(asset.id, { value: v.suggested.amount });
    for (const u of v.units) if (u.value && !u.declared) actions.updateUnit(u.unitId, { details: { value: u.value.amount } });
  };

  return (
    <SubScreen
      title="Évaluation"
      subtitle={asset.name}
      footer={v.suggested && !applied ? <Button label="Retenir cette estimation" onPress={apply} /> : <Button kind="secondary" icon={Bot} label="Affiner avec l'agent" onPress={() => askAgent(`Évalue ${asset.name} en t'appuyant sur ses données et ses documents, globalement et par ${profile.unit.one}. Dis-moi ce qui manque pour être plus précis.`)} />}
    >
      <View style={{ marginTop: 20, padding: 22, borderRadius: radius.card, backgroundColor: color.night, gap: 6 }}>
        <Text variant="rowSubtitle" tone="track">
          {v.declared ? "Valeur retenue" : "Estimation Keyo"}
        </Text>
        {base ? <Amount value={base} variant="display" tone="onNight" currencyTone="track" /> : <Text variant="title" tone="onNight">À compléter</Text>}
        {v.low && v.high && (
          <Text variant="rowSubtitle" tone="track">
            Fourchette : <Amount value={v.low} variant="rowSubtitle" tone="onNight" currencyTone="track" /> à <Amount value={v.high} variant="rowSubtitle" tone="onNight" currencyTone="track" />
          </Text>
        )}
        <View style={{ marginTop: 6 }}>
          <Status tone={CONF_TONE[v.confidence]} label={CONFIDENCE_LABEL[v.confidence]} />
        </View>
      </View>
      {v.declared && v.suggested && !applied && (
        <Text variant="rowSubtitle" tone="inkMuted" style={{ marginTop: 10 }}>
          Votre valeur diffère de l'estimation Keyo ({`${Math.round(((v.declared.amount - v.suggested.amount) / v.suggested.amount) * 100)} %`}).
        </Text>
      )}

      <SectionTitle>Méthode</SectionTitle>
      <Text variant="body">{v.method}</Text>
      <View style={{ marginTop: 12, padding: 16, borderRadius: radius.card, backgroundColor: color.surfaceRaised, gap: 10 }}>
        <Row label="Par le revenu" value={v.incomeValue ? <Amount value={v.incomeValue} /> : <Text variant="rowTitle">–</Text>} />
        <Row label={asset.type === "VEHICLE" ? "Par le prix d'achat décoté" : "Par le prix d'achat"} value={v.costValue ? <Amount value={v.costValue} /> : <Text variant="rowTitle">–</Text>} />
        {asset.type !== "VEHICLE" && <Row label="Rendement de référence" value={<Text variant="rowTitle">{`${v.yieldPermille / 10} %`}</Text>} />}
      </View>

      {v.units.length > 0 && <SectionTitle>{`Par ${profile.unit.one}`}</SectionTitle>}
      {v.units.map((u, i) => (
        <ListRow
          key={u.unitId}
          divider={i > 0}
          leading={<IconCircle initials={String(i + 1)} />}
          title={u.label}
          subtitle={u.declared ? "Valeur saisie" : u.source === "LEASE" ? `${cap(profile.amount)} en cours capitalisé` : u.source === "ASKING" ? `${cap(profile.amount)} demandé capitalisé` : "Quote-part du total"}
          trailing={<AmountList values={u.value ? [u.value] : []} />}
        />
      ))}

      {holders.length > 0 && base && (
        <>
          <SectionTitle>Part de chacun</SectionTitle>
          {holders.map((h, i) => (
            <ListRow
              key={h.holderId}
              divider={i > 0}
              leading={<IconCircle initials={formatShare(h.sharePermille).replace(" %", "").slice(0, 3)} bg="mintTint" fg="mintDeep" />}
              title={h.name}
              subtitle={formatShare(h.sharePermille)}
              trailing={<Amount value={{ amount: Math.round((base.amount * h.sharePermille) / 1000), currency: base.currency }} />}
            />
          ))}
        </>
      )}

      <SectionTitle>Pour une évaluation plus sûre</SectionTitle>
      {v.missing.length === 0 ? (
        <ListRow divider={false} leading={<IconCircle icon={FileCheck2} bg="mintTint" fg="mintDeep" />} title="Dossier complet" subtitle="Expertise, titre, prix d'achat, photos et revenu sont connus." />
      ) : (
        v.missing.map((m, i) => (
          <ListRow key={m} divider={i > 0} leading={<IconCircle icon={FileQuestion} bg="amberTint" fg="amber" />} title={cap(m)} chevron onPress={() => router.push({ pathname: "/bien/[id]/documents", params: { id: asset.id } })} />
        ))
      )}
      {v.suggested && applied && (
        <View style={{ marginTop: 8 }}>
          <Status tone="paid" label="Estimation retenue pour le patrimoine" />
        </View>
      )}

      <Text variant="caption" tone="inkMuted" style={{ marginTop: 20 }}>
        Estimation indicative, calculée sur les données de Keyo. Pour une vente, un partage ou une succession, faites établir la valeur par un expert ou un notaire.
      </Text>
    </SubScreen>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
      <Text variant="rowSubtitle" tone="inkMuted">
        {label}
      </Text>
      {value}
    </View>
  );
}
