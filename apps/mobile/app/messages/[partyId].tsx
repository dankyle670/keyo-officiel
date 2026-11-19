import { useMemo, useRef, useState, type ComponentRef } from "react";
import { KeyboardAvoidingView, Pressable, ScrollView, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowUp, ChevronLeft } from "lucide-react-native";
import { color, fontFamily } from "@keyo/tokens";
import { dayMonth, timeLabel } from "@/data/period";
import { initialsOf } from "@/data/selectors";
import { actions, useOwnerState } from "@/data/store";
import { IconCircle, RoundButton, Text } from "@/ui";

/** Conversation avec un locataire. Historique conservé (côté API : messagerie de la Phase 2, avec push). */
export default function Conversation() {
  const { partyId } = useLocalSearchParams<{ partyId: string }>();
  const insets = useSafeAreaInsets();
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const [text, setText] = useState("");
  const party = useOwnerState((s) => s.parties.find((p) => p.id === partyId));
  const all = useOwnerState((s) => s.messages);
  const messages = useMemo(() => all.filter((m) => m.partyId === partyId).sort((a, b) => a.at.localeCompare(b.at)), [all, partyId]);
  const name = party ? `${party.firstName} ${party.lastName}`.trim() : "Locataire";

  const send = () => {
    const t = text.trim();
    if (!t || !party) return;
    actions.sendMessage(party.id, t);
    setText("");
    setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 50);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: color.surface }} behavior="padding">
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 16, paddingBottom: 12, flexDirection: "row", alignItems: "center", gap: 12, borderBottomWidth: 1, borderBottomColor: color.line }}>
        <RoundButton icon={ChevronLeft} label="Retour" onPress={() => router.back()} />
        <IconCircle initials={initialsOf(name)} bg="mintTint" fg="mintDeep" diameter={40} />
        <Text variant="heading" numberOfLines={1} style={{ flex: 1 }}>
          {name}
        </Text>
      </View>

      <ScrollView ref={scroll} contentContainerStyle={{ padding: 16, gap: 10 }} onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: false })}>
        {messages.length === 0 && (
          <Text variant="rowSubtitle" tone="inkMuted" align="center" style={{ marginTop: 24 }}>
            Aucun message. Écrivez à {party?.firstName ?? "votre locataire"} : il reçoit une notification, ou un SMS s'il n'a pas l'app.
          </Text>
        )}
        {messages.map((m, i) => {
          const mine = m.from === "OWNER";
          const newDay = i === 0 || messages[i - 1]!.at.slice(0, 10) !== m.at.slice(0, 10);
          return (
            <View key={m.id}>
              {newDay && (
                <Text variant="caption" tone="inkMuted" align="center" style={{ marginVertical: 8 }}>
                  {dayMonth(m.at)}
                </Text>
              )}
              <View
                style={{
                  alignSelf: mine ? "flex-end" : "flex-start",
                  maxWidth: "82%",
                  backgroundColor: mine ? color.night : color.surfaceRaised,
                  borderRadius: 22,
                  borderBottomRightRadius: mine ? 6 : 22,
                  borderBottomLeftRadius: mine ? 22 : 6,
                  paddingHorizontal: 16,
                  paddingVertical: 10,
                }}
              >
                <Text variant="body" tone={mine ? "onNight" : "ink"}>
                  {m.text}
                </Text>
                <Text variant="caption" style={{ color: mine ? "#B8C3D6" : color.inkMuted, alignSelf: "flex-end", fontSize: 11 }}>
                  {timeLabel(m.at)}
                </Text>
              </View>
            </View>
          );
        })}
      </ScrollView>

      <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: insets.bottom + 8 }}>
        <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: color.surfaceRaised, borderRadius: 999, minHeight: 56, paddingLeft: 20, paddingRight: 6 }}>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Votre message"
            placeholderTextColor={color.inkMuted}
            multiline
            style={{ flex: 1, fontFamily: fontFamily.medium, fontSize: 16, color: color.ink, maxHeight: 120, paddingVertical: 14 }}
          />
          <Pressable
            onPress={send}
            disabled={!text.trim()}
            accessibilityLabel="Envoyer"
            style={{ width: 44, height: 44, borderRadius: 44, backgroundColor: color.mint, alignItems: "center", justifyContent: "center", opacity: text.trim() ? 1 : 0.4 }}
          >
            <ArrowUp size={22} strokeWidth={1.8} color={color.onMint} />
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
