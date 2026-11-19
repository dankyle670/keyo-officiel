import { useMemo, useRef, useState, type ComponentRef } from "react";
import { KeyboardAvoidingView, Pressable, ScrollView, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowUp, Sparkles } from "lucide-react-native";
import { color, fontFamily, radius } from "@keyo/tokens";
import { answer, FIRST_QUESTION, SUGGESTIONS, type AssistantAnswer } from "@/data/assistant";
import { getSession } from "@/data/session";
import { getOwnerState } from "@/data/store";
import { Amount, TAB_BAR_CLEARANCE, Text } from "@/ui";

const currency = () => {
  const s = getSession();
  return s.status === "signedIn" ? s.user.displayCurrency : "XOF";
};

type Turn = { id: number; question: string; reply: AssistantAnswer };

/** Assistant (07-ProAssistant) : question en langage naturel, réponse chiffrée avec graphique. */
export default function Assistant() {
  const insets = useSafeAreaInsets();
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const [input, setInput] = useState("");
  const [turns, setTurns] = useState<Turn[]>(() =>
    getOwnerState().assets.some((a) => a.name.includes("Bingerville")) ? [{ id: 0, question: FIRST_QUESTION, reply: answer(getOwnerState(), FIRST_QUESTION, currency()) }] : [],
  );

  const ask = (q: string) => {
    const question = q.trim();
    if (!question) return;
    setTurns((t) => [...t, { id: t.length, question, reply: answer(getOwnerState(), question, currency()) }]);
    setInput("");
    setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 50);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: color.surface }} behavior="padding">
      <ScrollView ref={scroll} contentContainerStyle={{ paddingTop: insets.top + 20, paddingHorizontal: 24, paddingBottom: 24 }}>
        <Text variant="screenTitle" accessibilityRole="header">
          Assistant
        </Text>
        {turns.length === 0 && (
          <Text variant="body" tone="inkMuted" style={{ marginTop: 12 }}>
            Posez une question sur vos biens, vos loyers ou vos dépenses. Les réponses s'appuient uniquement sur vos données.
          </Text>
        )}
        {turns.map((t) => (
          <View key={t.id} style={{ marginTop: 24, gap: 14 }}>
            <View style={{ alignSelf: "flex-end", maxWidth: "85%", backgroundColor: color.night, borderRadius: 22, borderBottomRightRadius: 6, paddingHorizontal: 16, paddingVertical: 12 }}>
              <Text variant="body" tone="onNight">
                {t.question}
              </Text>
            </View>
            <Reply reply={t.reply} />
          </View>
        ))}
      </ScrollView>

      <View style={{ paddingHorizontal: 16, paddingBottom: TAB_BAR_CLEARANCE + insets.bottom - 16, gap: 10 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 8 }}>
          {SUGGESTIONS.map((s) => (
            <Pressable key={s} onPress={() => ask(s)} style={{ height: 40, paddingHorizontal: 14, borderRadius: 999, backgroundColor: color.surfaceRaised, justifyContent: "center", borderWidth: 1, borderColor: color.line }}>
              <Text variant="rowSubtitle" style={{ fontFamily: fontFamily.semibold }}>
                {s}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
        <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: color.surfaceRaised, borderRadius: 999, height: 56, paddingLeft: 20, paddingRight: 6 }}>
          <TextInput
            value={input}
            onChangeText={setInput}
            onSubmitEditing={() => ask(input)}
            placeholder="Votre question"
            placeholderTextColor={color.inkMuted}
            returnKeyType="send"
            style={{ flex: 1, fontFamily: fontFamily.medium, fontSize: 16, color: color.ink }}
          />
          <Pressable
            onPress={() => ask(input)}
            disabled={!input.trim()}
            accessibilityLabel="Envoyer"
            style={{ width: 44, height: 44, borderRadius: 44, backgroundColor: color.mint, alignItems: "center", justifyContent: "center", opacity: input.trim() ? 1 : 0.4 }}
          >
            <ArrowUp size={22} strokeWidth={1.8} color={color.onMint} />
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

function Reply({ reply }: { reply: AssistantAnswer }) {
  const max = useMemo(() => Math.max(1, ...(reply.series ?? [1])), [reply.series]);
  return (
    <View style={{ backgroundColor: color.surfaceRaised, borderRadius: radius.card, padding: 20, gap: 10 }}>
      <View style={{ flexDirection: "row", gap: 10 }}>
        <Sparkles size={20} strokeWidth={1.8} color={color.mintDeep} />
        <Text variant="body" style={{ flex: 1 }}>
          {reply.lead}
        </Text>
      </View>
      {reply.amount && (
        <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6 }}>
          <Amount value={reply.amount.value} variant="amount" />
          {reply.amount.suffix ? (
            <Text variant="heading" tone="inkMuted">
              {reply.amount.suffix}
            </Text>
          ) : null}
        </View>
      )}
      {reply.series && (
        <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 6, height: 90, marginTop: 6 }} accessibilityLabel="Graphique des revenus nets par mois">
          {reply.series.map((v, i) => {
            const low = v < max;
            return (
              <View key={i} style={{ flex: 1, alignItems: "center", gap: 4 }}>
                <View style={{ width: "100%", height: Math.max(4, (v / max) * 70), borderRadius: 6, backgroundColor: low ? color.dotLate : color.mint }} />
                <Text variant="caption" tone="inkMuted" style={{ fontSize: 10, lineHeight: 12 }}>
                  {"JFMAMJJASOND"[i]}
                </Text>
              </View>
            );
          })}
        </View>
      )}
      {reply.note && (
        <Text variant="rowSubtitle" tone="inkMuted">
          {reply.note}
        </Text>
      )}
      {reply.sources.length > 0 && (
        <Text variant="caption" tone="inkMuted" style={{ borderTopWidth: 1, borderTopColor: color.line, paddingTop: 10 }}>
          Sources : {reply.sources.join(", ")}
        </Text>
      )}
    </View>
  );
}
