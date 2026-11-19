import { useEffect, useRef, useState, type ComponentRef } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Pressable, ScrollView, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowUp, Check, CircleAlert, RotateCcw, ShieldCheck, Sparkles, Volume2 } from "lucide-react-native";
import { color, fontFamily, radius } from "@keyo/tokens";
import { conversation, speak, useConversation, type FeedItem } from "@/agent/conversation";
import { RoundButton, Status, TAB_BAR_CLEARANCE, Text } from "@/ui";

const EXAMPLES = [
  "Est-ce que tout est en ordre ?",
  "Fais-moi le rapport du mois",
  "Qui paie en retard ?",
  "Demande des devis pour la fuite à Bingerville",
  "Programme l'entretien de la clim de la villa",
  "Envoie le gérant visiter le Studio A4",
];

/** Agent Keyo : chat écrit ou dicté, qui consulte et agit sur les biens, avec confirmation. */
export default function Agent() {
  const insets = useSafeAreaInsets();
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const c = useConversation();
  const [input, setInput] = useState("");
  const params = useLocalSearchParams<{ prompt?: string; k?: string }>();
  const handled = useRef<string | undefined>(undefined);
  const waiting = c.feed.some((f) => f.kind === "proposal" && f.status === "pending");

  // Demande envoyée depuis un autre écran (Contrôle de gestion, par exemple).
  useEffect(() => {
    if (params.prompt && params.k && handled.current !== params.k) {
      handled.current = params.k;
      conversation.send(params.prompt);
    }
  }, [params.k, params.prompt]);

  useEffect(() => {
    const t = setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 60);
    return () => clearTimeout(t);
  }, [c.feed.length, c.busy]);

  const send = (text: string) => {
    if (!text.trim() || c.busy || waiting) return;
    setInput("");
    conversation.send(text);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: color.surface }} behavior="padding">
      <ScrollView ref={scroll} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingTop: insets.top + 12, paddingHorizontal: 20, paddingBottom: 24 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Text variant="screenTitle" accessibilityRole="header">
              Agent Keyo
            </Text>
            <View style={{ marginTop: 4 }}>
              {c.mode === "claude" ? (
                <Status tone="paid" label="Connecté à Claude" />
              ) : c.mode === "demo" ? (
                <Status tone="late" label={c.offline ? "Serveur injoignable, mode démo" : "Mode démo, sans IA"} />
              ) : (
                <Status tone="neutral" label="Prêt" />
              )}
            </View>
          </View>
          <RoundButton icon={ShieldCheck} label="Contrôle de gestion" onPress={() => router.push("/controle")} />
          {c.feed.length > 0 && <RoundButton icon={RotateCcw} label="Nouvelle conversation" onPress={() => conversation.reset()} />}
        </View>

        {c.feed.length === 0 && (
          <View style={{ marginTop: 20, gap: 14 }}>
            <Text variant="body" tone="inkMuted">
              Votre gestionnaire, disponible à toute heure. Il consulte vos biens, vos loyers et vos documents, et agit pour vous : dépenses, relances, devis, entretien, missions sur le terrain, rapport du mois, contrôle des pièces et de la fiscalité. Il vous demande toujours avant de modifier quoi que ce soit.
            </Text>
            <Text variant="rowSubtitle" tone="inkMuted">
              Pour parler, touchez le micro du clavier.
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {EXAMPLES.map((e) => (
                <Pressable key={e} onPress={() => send(e)} style={{ minHeight: 40, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999, backgroundColor: color.surfaceRaised, borderWidth: 1, borderColor: color.line }}>
                  <Text variant="rowSubtitle" style={{ fontFamily: fontFamily.semibold }}>
                    {e}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {c.feed.map((f) => (
          <Item key={f.id} item={f} busy={c.busy} />
        ))}

        {c.busy && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 16 }} accessibilityLiveRegion="polite">
            <ActivityIndicator color={color.mintDeep} />
            <Text variant="rowSubtitle" tone="inkMuted">
              L'agent travaille…
            </Text>
          </View>
        )}
      </ScrollView>

      <View style={{ paddingHorizontal: 16, paddingBottom: TAB_BAR_CLEARANCE + insets.bottom - 16, gap: 8 }}>
        {waiting && (
          <Text variant="caption" tone="inkMuted" align="center">
            Confirmez ou refusez l'action proposée pour continuer.
          </Text>
        )}
        <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: color.surfaceRaised, borderRadius: 999, minHeight: 56, paddingLeft: 20, paddingRight: 6 }}>
          <TextInput
            value={input}
            onChangeText={setInput}
            onSubmitEditing={() => send(input)}
            placeholder="Écrivez ou dictez votre demande"
            placeholderTextColor={color.inkMuted}
            returnKeyType="send"
            editable={!waiting}
            multiline
            blurOnSubmit
            style={{ flex: 1, fontFamily: fontFamily.medium, fontSize: 16, color: color.ink, maxHeight: 110, paddingVertical: 14 }}
          />
          <Pressable
            onPress={() => send(input)}
            disabled={!input.trim() || c.busy || waiting}
            accessibilityLabel="Envoyer"
            style={{ width: 44, height: 44, borderRadius: 44, backgroundColor: color.mint, alignItems: "center", justifyContent: "center", opacity: input.trim() && !c.busy && !waiting ? 1 : 0.4 }}
          >
            <ArrowUp size={22} strokeWidth={1.8} color={color.onMint} />
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const clean = (t: string) => t.replace(/\*\*(.+?)\*\*/g, "$1").replace(/^#+\s*/gm, "");

function Item({ item, busy }: { item: FeedItem; busy: boolean }) {
  switch (item.kind) {
    case "user":
      return (
        <View style={{ alignSelf: "flex-end", maxWidth: "85%", backgroundColor: color.night, borderRadius: 22, borderBottomRightRadius: 6, paddingHorizontal: 16, paddingVertical: 12, marginTop: 20 }}>
          <Text variant="body" tone="onNight">
            {item.text}
          </Text>
        </View>
      );
    case "agent": {
      const lines = clean(item.text).split("\n");
      const sources = lines.filter((l) => /^sources\s*:/i.test(l.trim()));
      const body = lines.filter((l) => !/^sources\s*:/i.test(l.trim())).join("\n").trim();
      return (
        <View style={{ backgroundColor: color.surfaceRaised, borderRadius: radius.card, padding: 18, gap: 10, marginTop: 14 }}>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Sparkles size={20} strokeWidth={1.8} color={color.mintDeep} />
            <Text variant="body" style={{ flex: 1 }} selectable>
              {body}
            </Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, borderTopWidth: sources.length ? 1 : 0, borderTopColor: color.line, paddingTop: sources.length ? 10 : 0 }}>
            <Text variant="caption" tone="inkMuted" style={{ flex: 1 }}>
              {sources.join(" ")}
            </Text>
            <Pressable onPress={() => speak(item.text)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Lire la réponse à voix haute">
              <Volume2 size={20} strokeWidth={1.8} color={color.inkMuted} />
            </Pressable>
          </View>
        </View>
      );
    }
    case "activity":
      return (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10, paddingHorizontal: 6 }}>
          {item.ok ? <Check size={16} strokeWidth={2} color={color.mintDeep} /> : <CircleAlert size={16} strokeWidth={1.8} color={color.danger} />}
          <Text variant="caption" tone="inkMuted" style={{ flex: 1 }}>
            {item.label}
          </Text>
        </View>
      );
    case "proposal":
      return (
        <View style={{ backgroundColor: color.surfaceRaised, borderRadius: radius.card, padding: 18, gap: 12, marginTop: 14, borderWidth: 2, borderColor: item.status === "pending" ? color.mint : color.line }}>
          <Text variant="caption" tone="inkMuted">
            Voici ce que je vais faire
          </Text>
          <Text variant="rowTitle">{item.description}</Text>
          {item.status === "pending" ? (
            <View style={{ flexDirection: "row", gap: 10 }}>
              <Pill label="Refuser" onPress={() => conversation.decide(item.id, false)} disabled={busy} />
              <Pill label="Confirmer" strong onPress={() => conversation.decide(item.id, true)} disabled={busy} />
            </View>
          ) : (
            <Status
              tone={item.status === "done" ? "paid" : item.status === "declined" ? "neutral" : "danger"}
              label={item.status === "done" ? `Fait${item.result ? ` : ${item.result}` : ""}` : item.status === "declined" ? "Refusé" : `Échec${item.result ? ` : ${item.result}` : ""}`}
            />
          )}
        </View>
      );
    case "error":
      return (
        <View style={{ flexDirection: "row", gap: 8, marginTop: 14, paddingHorizontal: 6 }}>
          <CircleAlert size={18} strokeWidth={1.8} color={color.danger} />
          <Text variant="rowSubtitle" tone="danger" style={{ flex: 1 }}>
            {item.text}
          </Text>
        </View>
      );
  }
}

/** Boutons de la carte de confirmation : plus petits que le bouton principal de l'écran. */
function Pill({ label, onPress, strong, disabled }: { label: string; onPress: () => void; strong?: boolean; disabled?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={({ pressed }) => ({
        flex: 1,
        height: 48,
        borderRadius: 999,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: strong ? color.mint : color.surfaceSoft,
        opacity: disabled ? 0.4 : pressed ? 0.8 : 1,
      })}
    >
      <Text variant="rowTitle" tone={strong ? "onMint" : "ink"}>
        {label}
      </Text>
    </Pressable>
  );
}
