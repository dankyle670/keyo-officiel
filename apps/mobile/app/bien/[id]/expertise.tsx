import { useEffect, useMemo, useRef, useState, type ComponentRef } from "react";
import { KeyboardAvoidingView, Pressable, ScrollView, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowUp, Check, ChevronLeft, Undo2 } from "lucide-react-native";
import { appraisalQuestions, appraise, CONFIDENCE_LABEL, formatMoney, type AppraisalAnswers, type AppraisalQuestion, type AppraisalResult } from "@keyo/shared";
import { color, fontFamily, radius } from "@keyo/tokens";
import { useConversation } from "@/agent/conversation";
import { KeyoMark } from "@/brand/Logo";
import { today } from "@/data/period";
import { actions, useOwnerState } from "@/data/store";
import { Amount, Button, RoundButton, Status, Text } from "@/ui";

const CONF_TONE = { LOW: "late", MEDIUM: "info", HIGH: "paid" } as const;

/**
 * Expertise Keyo : l'entretien qu'un expert mènerait sur place, une question à la fois, puis
 * l'estimation détaillée. Sans clé Claude, l'entretien est simulé par le moteur partagé
 * (`appraise`) ; avec la clé, l'agent mène le même entretien dans le chat.
 */
export default function Expertise() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const state = useOwnerState((s) => s);
  const asset = state.assets.find((a) => a.id === id);
  const questions = useMemo(() => (asset ? appraisalQuestions(asset, state.units, state.agreements, today()) : []), [asset, state.units, state.agreements]);
  const { mode } = useConversation();
  const [answers, setAnswers] = useState<AppraisalAnswers>({});
  const [step, setStep] = useState(0);
  const [multi, setMulti] = useState<string[]>([]);
  const [text, setText] = useState("");
  const [result, setResult] = useState<AppraisalResult | null>(null);
  const [thinking, setThinking] = useState(false);
  const [saved, setSaved] = useState(false);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);

  const q: AppraisalQuestion | undefined = questions[step];
  const done = step >= questions.length;

  useEffect(() => {
    const t = setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 60);
    return () => clearTimeout(t);
  }, [step, thinking, result]);

  // Fin de l'entretien : l'expert « analyse » puis rend son estimation.
  useEffect(() => {
    if (!done || result || !asset || questions.length === 0) return;
    setThinking(true);
    const t = setTimeout(() => {
      setResult(appraise({ asset, units: state.units, agreements: state.agreements, documents: state.documents, today: today(), answers }));
      setThinking(false);
    }, 1400);
    return () => clearTimeout(t);
  }, [done]);

  if (!asset || questions.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: color.surface, padding: 24, paddingTop: insets.top + 12, gap: 16 }}>
        <RoundButton icon={ChevronLeft} label="Retour" onPress={() => router.back()} />
        <Text variant="screenTitle">Expertise bientôt disponible</Text>
        <Text variant="body" tone="inkMuted">
          L'expertise Keyo couvre les maisons, les appartements, les immeubles et les plantations.
        </Text>
      </View>
    );
  }

  const answer = (value: AppraisalAnswers[string]) => {
    if (!q) return;
    setAnswers((a) => ({ ...a, [q.id]: value }));
    setMulti([]);
    setText("");
    setStep((s) => s + 1);
  };
  const undo = () => {
    if (step === 0) return;
    const prevQ = questions[step - 1]!;
    setAnswers((a) => {
      const next = { ...a };
      delete next[prevQ.id];
      return next;
    });
    setResult(null);
    setStep(step - 1);
  };
  const shown = (qq: AppraisalQuestion, v: AppraisalAnswers[string]) => {
    if (v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0)) return "Je passe";
    if (Array.isArray(v)) return v.map((x) => qq.options?.find((o) => o.value === x)?.label ?? x).join(", ");
    if (typeof v === "number") return `${v.toLocaleString("fr-FR")}${qq.unit ? ` ${qq.unit}` : ""}`;
    return qq.options?.find((o) => o.value === v)?.label ?? String(v);
  };
  const save = (apply: boolean) => {
    if (!result) return;
    actions.saveAppraisal(asset.id, answers, result, "OWNER", apply);
    setSaved(true);
    router.back();
  };
  const sendNumber = () => {
    const n = Number(text.replace(/\s/g, "").replace(",", "."));
    if (n > 0) answer(n);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: color.surface }} behavior="padding">
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 16, paddingBottom: 10, flexDirection: "row", alignItems: "center", gap: 12 }}>
        <RoundButton icon={ChevronLeft} label="Retour" onPress={() => router.back()} />
        <View style={{ flex: 1 }}>
          <Text variant="rowTitle">Expertise de {asset.name}</Text>
          <Text variant="caption" tone="inkMuted">
            {mode === "claude" ? "Expert Keyo" : "Expert Keyo, simulation"} · {Math.min(step, questions.length)} sur {questions.length}
          </Text>
        </View>
        {step > 0 && !saved && (
          <Pressable onPress={undo} hitSlop={10} accessibilityRole="button" accessibilityLabel="Revenir à la question précédente">
            <Undo2 size={22} strokeWidth={1.8} color={color.ink} />
          </Pressable>
        )}
      </View>
      <View style={{ height: 3, marginHorizontal: 16, borderRadius: 3, backgroundColor: color.line }}>
        <View style={{ height: 3, borderRadius: 3, width: `${(Math.min(step, questions.length) / questions.length) * 100}%`, backgroundColor: color.mint }} />
      </View>

      <ScrollView ref={scroll} contentContainerStyle={{ padding: 16, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
        <Expert first>
          Bonjour. Je vais vous poser {questions.length} questions sur {asset.name}, comme le ferait un expert venu sur place. Comptez deux minutes. Les réponses déjà connues de Keyo sont proposées, il suffit de les confirmer.
        </Expert>
        {questions.slice(0, step).map((qq) => (
          <View key={qq.id}>
            <Expert>{qq.ask}</Expert>
            <Mine>{shown(qq, answers[qq.id])}</Mine>
          </View>
        ))}
        {q && (
          <Expert hint={q.hint}>{q.ask}</Expert>
        )}
        {thinking && <Expert>J'analyse les prix du secteur et vos réponses…</Expert>}
        {result && (
          <>
            <Expert>Voici mon estimation.</Expert>
            <View style={{ marginLeft: 34, marginTop: 10, padding: 20, borderRadius: radius.card, backgroundColor: color.night, gap: 8 }}>
              <Text variant="rowSubtitle" tone="track">
                Valeur estimée
              </Text>
              <Amount value={result.value} variant="display" tone="onNight" currencyTone="track" />
              <Text variant="rowSubtitle" tone="track">
                {`Entre ${formatMoney(result.low)} et ${formatMoney(result.high)}`}
              </Text>
              <Status tone={CONF_TONE[result.confidence]} label={CONFIDENCE_LABEL[result.confidence]} />
            </View>
            <View style={{ marginLeft: 34, marginTop: 10, padding: 18, borderRadius: radius.card, backgroundColor: color.surfaceRaised, gap: 10 }}>
              <Text variant="rowTitle">Ce qui compte dans le prix</Text>
              {result.factors.map((f) => (
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
                {result.method}
              </Text>
            </View>
            {result.ownerGapPercent !== undefined && (
              <Expert>
                {Math.abs(result.ownerGapPercent) <= 10
                  ? "Votre propre estimation est cohérente avec la mienne."
                  : `Votre estimation est ${result.ownerGapPercent > 0 ? "supérieure" : "inférieure"} de ${Math.abs(result.ownerGapPercent)} % à la mienne. ${result.ownerGapPercent > 0 ? "Un acheteur s'appuiera sur les prix du secteur : une expertise sur place pourra trancher." : "Vous sous-estimez peut-être votre bien."}`}
              </Expert>
            )}
            <Expert>
              {result.confidence === "HIGH"
                ? "Le dossier est solide. Pour une vente ou une succession, faites tout de même confirmer cette valeur par un notaire ou un expert agréé."
                : "Pour fiabiliser cette valeur, ajoutez le titre de propriété et des photos récentes dans les documents du bien. Pour une vente ou une succession, faites-la confirmer par un expert agréé."}
            </Expert>
          </>
        )}
      </ScrollView>

      <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: insets.bottom + 12, gap: 10 }}>
        {q && q.type === "choice" && (
          <ScrollView style={{ maxHeight: 330 }} contentContainerStyle={{ gap: 8 }} keyboardShouldPersistTaps="handled">
            {q.prefill !== undefined && q.options?.some((o) => o.value === q.prefill) && (
              <Choice label={`Oui, ${q.options.find((o) => o.value === q.prefill)!.label.toLowerCase()}`} strong onPress={() => answer(q.prefill as string)} />
            )}
            {q.options?.filter((o) => o.value !== q.prefill).map((o) => <Choice key={o.value} label={o.label} hint={o.hint} onPress={() => answer(o.value)} />)}
          </ScrollView>
        )}
        {q && q.type === "multi" && (
          <>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {q.options?.map((o) => {
                const on = multi.includes(o.value);
                return (
                  <Pressable
                    key={o.value}
                    onPress={() => setMulti((m) => (on ? m.filter((x) => x !== o.value) : [...m, o.value]))}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                    style={{ height: 40, paddingHorizontal: 14, borderRadius: 999, flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: on ? color.mintTint : color.surfaceRaised, borderWidth: 1.5, borderColor: on ? color.mint : "transparent" }}
                  >
                    {on && <Check size={16} strokeWidth={2} color={color.mintDeep} />}
                    <Text variant="rowSubtitle">{o.label}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Button label={multi.length ? "Valider" : "Aucun"} onPress={() => answer(multi)} />
          </>
        )}
        {q && q.type === "number" && (
          <>
            {typeof q.prefill === "number" && <Choice label={`Oui, ${q.prefill.toLocaleString("fr-FR")}${q.unit ? ` ${q.unit}` : ""}`} strong onPress={() => answer(q.prefill as number)} />}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, height: 56, borderRadius: 999, backgroundColor: color.surfaceRaised, paddingLeft: 20, paddingRight: 6 }}>
              <TextInput
                value={text}
                onChangeText={(t) => setText(t.replace(/[^\d\s,]/g, ""))}
                keyboardType="decimal-pad"
                placeholder={q.unit ? `En ${q.unit}` : "Votre réponse"}
                placeholderTextColor={color.inkMuted}
                onSubmitEditing={sendNumber}
                style={{ flex: 1, fontFamily: fontFamily.medium, fontSize: 16, color: color.ink }}
                accessibilityLabel={q.ask}
              />
              <Pressable
                onPress={sendNumber}
                disabled={!(Number(text.replace(/\s/g, "").replace(",", ".")) > 0)}
                accessibilityRole="button"
                accessibilityLabel="Envoyer"
                style={{ width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: Number(text.replace(/\s/g, "").replace(",", ".")) > 0 ? color.mint : color.line }}
              >
                <ArrowUp size={22} strokeWidth={2} color={color.night} />
              </Pressable>
            </View>
          </>
        )}
        {q?.optional && q.type !== "multi" && (
          <Pressable onPress={() => answer(null)} hitSlop={8} style={{ alignSelf: "center", paddingVertical: 4 }} accessibilityRole="button">
            <Text variant="rowSubtitle" tone="inkMuted">
              Passer cette question
            </Text>
          </Pressable>
        )}
        {result && (
          <>
            <Button label="Retenir cette valeur" onPress={() => save(true)} />
            <Button kind="soft" label="Enregistrer sans l'appliquer" onPress={() => save(false)} />
          </>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

function Expert({ children, hint, first }: { children: React.ReactNode; hint?: string; first?: boolean }) {
  return (
    <View style={{ flexDirection: "row", gap: 10, marginTop: first ? 4 : 16 }}>
      <KeyoMark size={24} />
      <View style={{ flex: 1, gap: 4 }}>
        <Text variant="body" style={{ lineHeight: 24 }}>
          {children}
        </Text>
        {hint ? (
          <Text variant="caption" tone="inkMuted">
            {hint}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function Mine({ children }: { children: React.ReactNode }) {
  return (
    <View style={{ alignSelf: "flex-end", maxWidth: "82%", marginTop: 12, backgroundColor: color.night, borderRadius: 22, borderBottomRightRadius: 6, paddingHorizontal: 16, paddingVertical: 11 }}>
      <Text variant="body" tone="onNight">
        {children}
      </Text>
    </View>
  );
}

function Choice({ label, hint, strong, onPress }: { label: string; hint?: string; strong?: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => ({
        minHeight: 52,
        borderRadius: 26,
        paddingHorizontal: 20,
        paddingVertical: 10,
        justifyContent: "center",
        backgroundColor: strong ? color.mint : color.surfaceRaised,
        opacity: pressed ? 0.75 : 1,
      })}
    >
      <Text variant="rowTitle" tone={strong ? "night" : "ink"}>
        {label}
      </Text>
      {hint ? (
        <Text variant="caption" tone={strong ? "night" : "inkMuted"}>
          {hint}
        </Text>
      ) : null}
    </Pressable>
  );
}
