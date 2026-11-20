import { useMemo } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Bot, ClipboardList, FileCheck2, FileQuestion } from "lucide-react-native";
import { appraisalKind, appraisalQuestions, cap, CONFIDENCE_LABEL, formatMoney, formatShare, profileOf, valueAsset } from "@keyo/shared";
import { color, radius } from "@keyo/tokens";
import { askAgent } from "@/agent/navigation";
import { fullDate, today } from "@/data/period";
import { assetHolders, latestAppraisal } from "@/data/selectors";
import { useUser } from "@/data/session";
import { actions, useOwnerState } from "@/data/store";
import { Amount, AmountList, Button, IconCircle, ListRow, SectionTitle, Status, SubScreen, Text } from "@/ui";

const CONF_TONE = { LOW: "late", MEDIUM: "info", HIGH: "paid" } as const;

/**
 * Évaluation d'un bien : l'expertise Keyo (entretien d'expert puis estimation détaillée),
 * ouverte aux maisons, appartements et plantations. Les autres types arrivent ensuite.
 */
export default function Valuation() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const user = useUser();
  const state = useOwnerState((s) => s);
  const asset = state.assets.find((a) => a.id === id);
  const quick = useMemo(() => (asset ? valueAsset({ asset, units: state.units, agreements: state.agreements, documents: state.documents, today: today() }) : null), [state, asset]);

  if (!asset || !quick) {
    return (
      <SubScreen title="Bien introuvable">
        <Text variant="body" tone="inkMuted">
          Ce bien n'existe plus sur ce téléphone.
        </Text>
      </SubScreen>
    );
  }
  const profile = profileOf(asset.type);
  const kind = appraisalKind(asset);
  const start = () => router.push({ pathname: "/bien/[id]/expertise", params: { id: asset.id } });

  if (!kind) {
    return (
      <SubScreen title="Évaluation" subtitle={asset.name} footer={<Button kind="secondary" label="Saisir une valeur moi-même" onPress={() => router.push({ pathname: "/bien/[id]/modifier", params: { id: asset.id } })} />}>
        <View style={{ marginTop: 20, padding: 22, borderRadius: radius.card, backgroundColor: color.surfaceRaised, gap: 8 }}>
          <Status tone="neutral" label="Bientôt disponible" />
          <Text variant="title">L'expertise des {asset.type === "REAL_ESTATE" ? `${profile.kinds[String(asset.details.kind)]?.toLowerCase() ?? "biens"}s` : `${profile.label.toLowerCase()}s`} arrive bientôt</Text>
          <Text variant="body" tone="inkMuted">
            Pour l'instant, Keyo évalue les maisons, les appartements et les plantations. En attendant, vous pouvez saisir la valeur de ce bien vous-même ; elle compte dans votre patrimoine.
          </Text>
          {asset.value && (
            <View style={{ marginTop: 6 }}>
              <Text variant="rowSubtitle" tone="inkMuted">
                Valeur saisie
              </Text>
              <Amount value={asset.value} variant="amount" />
            </View>
          )}
        </View>
      </SubScreen>
    );
  }

  const last = latestAppraisal(state, asset.id);
  const r = last?.result;
  const holders = asset.holding === "FAMILY" ? assetHolders(state, asset.id, { id: user.id, name: "Vous" }) : [];
  const count = appraisalQuestions(asset, state.units, state.agreements, today()).length;

  return (
    <SubScreen
      title="Évaluation"
      subtitle={asset.name}
      footer={last && !last.applied ? <Button label="Retenir cette valeur" onPress={() => actions.applyAppraisal(last.id)} /> : <Button label={last ? "Refaire l'expertise" : "Lancer l'expertise"} onPress={start} />}
    >
      {!r ? (
        <View style={{ marginTop: 20, padding: 22, borderRadius: radius.card, backgroundColor: color.night, gap: 10 }}>
          <ClipboardList size={28} strokeWidth={1.8} color={color.mint} />
          <Text variant="title" tone="onNight">
            Expertise Keyo
          </Text>
          <Text variant="body" tone="track">
            {`${count} questions, comme un expert venu sur place : ${kind === "PLANTATION" ? "culture, surface, stade des plants, rendement, entretien, titre, accès" : "quartier, surface, âge, état, finitions, équipements, titre, accès"}. Vous obtenez une valeur, une fourchette et ce qui fait le prix.`}
          </Text>
          {quick.suggested && (
            <Text variant="rowSubtitle" tone="track">
              {`Première indication sans expertise : ${formatMoney(quick.suggested)}.`}
            </Text>
          )}
        </View>
      ) : (
        <>
          <View style={{ marginTop: 20, padding: 22, borderRadius: radius.card, backgroundColor: color.night, gap: 6 }}>
            <Text variant="rowSubtitle" tone="track">
              {`Expertise du ${fullDate(last!.createdAt.slice(0, 10))}`}
            </Text>
            <Amount value={r.value} variant="display" tone="onNight" currencyTone="track" />
            <Text variant="rowSubtitle" tone="track">
              {`Entre ${formatMoney(r.low)} et ${formatMoney(r.high)}`}
            </Text>
            <View style={{ flexDirection: "row", gap: 16, marginTop: 6, flexWrap: "wrap" }}>
              <Status tone={CONF_TONE[r.confidence]} label={CONFIDENCE_LABEL[r.confidence]} />
              <Status tone={last!.applied ? "paid" : "neutral"} label={last!.applied ? "Valeur retenue" : "Non appliquée"} />
            </View>
          </View>

          <SectionTitle>Ce qui fait le prix</SectionTitle>
          <View style={{ padding: 18, borderRadius: radius.card, backgroundColor: color.surfaceRaised, gap: 10 }}>
            {r.factors.map((f) => (
              <View key={f.label} style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
                <Text variant="rowSubtitle" style={{ flex: 1 }}>
                  {f.label}
                </Text>
                <Text variant="rowSubtitle" tone={f.effect.startsWith("−") ? "danger" : f.effect.startsWith("+") ? "mintDeep" : "inkMuted"} tabular>
                  {f.effect}
                </Text>
              </View>
            ))}
            <Text variant="caption" tone="inkMuted">
              {r.method}
            </Text>
          </View>

          {r.perUnit.length > 1 && (
            <>
              <SectionTitle>{`Par ${profile.unit.one}`}</SectionTitle>
              {r.perUnit.map((u, i) => (
                <ListRow
                  key={u.unitId}
                  divider={i > 0}
                  leading={<IconCircle initials={String(i + 1)} />}
                  title={state.units.find((x) => x.id === u.unitId)?.label ?? cap(profile.unit.one)}
                  trailing={<AmountList values={[u.value]} />}
                />
              ))}
            </>
          )}

          {holders.length > 0 && (
            <>
              <SectionTitle>Part de chacun</SectionTitle>
              {holders.map((h, i) => (
                <ListRow
                  key={h.holderId}
                  divider={i > 0}
                  leading={<IconCircle initials={formatShare(h.sharePermille).replace(" %", "").slice(0, 3)} bg="mintTint" fg="mintDeep" />}
                  title={h.name}
                  subtitle={formatShare(h.sharePermille)}
                  trailing={<Amount value={{ amount: Math.round((r.value.amount * h.sharePermille) / 1000), currency: r.value.currency }} />}
                />
              ))}
            </>
          )}

          {last!.applied && (
            <View style={{ marginTop: 16 }}>
              <Button kind="soft" label="Refaire l'expertise" onPress={start} />
            </View>
          )}
        </>
      )}

      <SectionTitle>Pour une évaluation plus sûre</SectionTitle>
      {quick.missing.length === 0 ? (
        <ListRow divider={false} leading={<IconCircle icon={FileCheck2} bg="mintTint" fg="mintDeep" />} title="Dossier complet" subtitle="Expertise, titre, prix d'achat, photos et revenu sont connus." />
      ) : (
        quick.missing.map((m, i) => (
          <ListRow key={m} divider={i > 0} leading={<IconCircle icon={FileQuestion} bg="amberTint" fg="amber" />} title={cap(m)} chevron onPress={() => router.push({ pathname: "/bien/[id]/documents", params: { id: asset.id } })} />
        ))
      )}
      <ListRow
        leading={<IconCircle icon={Bot} />}
        title="En parler avec l'agent"
        subtitle="Questions sur la valeur, la vente ou le partage"
        chevron
        onPress={() => askAgent(`Parlons de la valeur de ${asset.name} : que penses-tu de l'estimation et que faudrait-il pour la fiabiliser ?`)}
      />

      <Text variant="caption" tone="inkMuted" style={{ marginTop: 20 }}>
        Estimation indicative, établie à partir de vos réponses et de repères de marché. Pour une vente, un partage ou une succession, faites établir la valeur par un expert agréé ou un notaire.
      </Text>
    </SubScreen>
  );
}
