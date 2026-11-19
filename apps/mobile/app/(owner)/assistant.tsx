import { useEffect, useRef, useState, type ComponentRef } from "react";
import { Animated, Easing, Image, KeyboardAvoidingView, Pressable, ScrollView, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowUp, Camera, Check, CircleAlert, FileText, ImagePlus, Paperclip, Plus, ShieldCheck, SquarePen, Volume2, Wallet, X, type LucideIcon } from "lucide-react-native";
import { color, fontFamily, radius } from "@keyo/tokens";
import { pickImages, pickPdf, type Attachment } from "@/agent/attachments";
import { conversation, speak, useConversation, type AttachmentRef, type FeedItem } from "@/agent/conversation";
import { KeyoMark } from "@/brand/Logo";
import { useUser } from "@/data/session";
import { Sheet, TAB_BAR_CLEARANCE, Text } from "@/ui";

const SUGGESTIONS: { icon: LucideIcon; title: string; prompt: string }[] = [
  { icon: ShieldCheck, title: "Tout est en ordre ?", prompt: "Est-ce que tout est en ordre ?" },
  { icon: FileText, title: "Rapport du mois", prompt: "Fais-moi le rapport du mois" },
  { icon: Wallet, title: "Loyers en retard", prompt: "Qui paie en retard ?" },
];

/** Agent Keyo : conversation épurée, écrite ou dictée, avec envoi de photos et de PDF. */
export default function Agent() {
  const insets = useSafeAreaInsets();
  const user = useUser();
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const c = useConversation();
  const [input, setInput] = useState("");
  const [files, setFiles] = useState<Attachment[]>([]);
  const [attachOpen, setAttachOpen] = useState(false);
  const params = useLocalSearchParams<{ prompt?: string; k?: string }>();
  const handled = useRef<string | undefined>(undefined);
  const waiting = c.feed.some((f) => f.kind === "proposal" && f.status === "pending");
  const canSend = (input.trim().length > 0 || files.length > 0) && !c.busy && !waiting;

  // Demande envoyée depuis un autre écran (Contrôle de gestion, Aide).
  useEffect(() => {
    if (params.prompt && params.k && handled.current !== params.k) {
      handled.current = params.k;
      conversation.send(params.prompt);
    }
  }, [params.k, params.prompt]);

  useEffect(() => {
    const t = setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 80);
    return () => clearTimeout(t);
  }, [c.feed.length, c.busy]);

  const send = (text: string) => {
    if (!canSend && !text) return;
    if (c.busy || waiting) return;
    const toSend = files;
    setInput("");
    setFiles([]);
    conversation.send(text, toSend);
  };

  const attach = async (source: "camera" | "library" | "pdf") => {
    setAttachOpen(false);
    // Laisser la feuille se fermer avant d'ouvrir le sélecteur du système.
    await new Promise((r) => setTimeout(r, 350));
    const picked = source === "pdf" ? await pickPdf() : await pickImages(source === "camera");
    setFiles((f) => [...f, ...picked].slice(0, 4));
  };

  const empty = c.feed.length === 0;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: color.surface }} behavior="padding">
      {/* En-tête discret */}
      <View style={{ paddingTop: insets.top + 6, paddingHorizontal: 16, paddingBottom: 8, flexDirection: "row", alignItems: "center", gap: 10 }}>
        <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 10 }}>
          <KeyoMark size={30} />
          <View>
            <Text variant="rowTitle" style={{ fontFamily: fontFamily.extrabold }} accessibilityRole="header">
              Agent Keyo
            </Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
              <View style={{ width: 7, height: 7, borderRadius: 7, backgroundColor: c.mode === "claude" ? color.dotPaid : c.mode === "demo" ? color.dotLate : color.track }} />
              <Text variant="caption" tone="inkMuted">
                {c.mode === "claude" ? "En ligne" : c.mode === "demo" ? (c.offline ? "Hors ligne, mode démo" : "Mode démo") : "Prêt"}
              </Text>
            </View>
          </View>
        </View>
        <HeaderIcon icon={ShieldCheck} label="Contrôle de gestion" onPress={() => router.push("/controle")} />
        <HeaderIcon icon={SquarePen} label="Nouvelle conversation" onPress={() => conversation.reset()} disabled={empty} />
      </View>

      <ScrollView ref={scroll} keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 20, paddingBottom: 16 }}>
        {empty ? (
          <View style={{ flex: 1, justifyContent: "center", paddingVertical: 24 }}>
            <Text variant="title" style={{ fontSize: 28, lineHeight: 34 }}>
              Bonjour {user.firstName},
            </Text>
            <Text variant="title" tone="inkMuted" style={{ fontSize: 28, lineHeight: 34 }}>
              que puis-je faire pour vous ?
            </Text>
            <View style={{ marginTop: 28, gap: 10 }}>
              {SUGGESTIONS.map((s) => (
                <Pressable
                  key={s.title}
                  onPress={() => conversation.send(s.prompt)}
                  accessibilityRole="button"
                  style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 20, backgroundColor: color.surfaceRaised, opacity: pressed ? 0.7 : 1 })}
                >
                  <s.icon size={20} strokeWidth={1.8} color={color.mintDeep} />
                  <Text variant="rowTitle" style={{ flex: 1 }}>
                    {s.title}
                  </Text>
                </Pressable>
              ))}
              <Pressable
                onPress={() => setAttachOpen(true)}
                accessibilityRole="button"
                style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 20, backgroundColor: color.surfaceRaised, opacity: pressed ? 0.7 : 1 })}
              >
                <Paperclip size={20} strokeWidth={1.8} color={color.mintDeep} />
                <View style={{ flex: 1 }}>
                  <Text variant="rowTitle">Envoyer un document</Text>
                  <Text variant="caption" tone="inkMuted">
                    Facture, bail, assurance : je le lis et je le classe.
                  </Text>
                </View>
              </Pressable>
            </View>
          </View>
        ) : (
          c.feed.map((f, i) => <Item key={f.id} item={f} busy={c.busy} prev={c.feed[i - 1]} />)
        )}
        {c.busy && <Typing />}
      </ScrollView>

      {/* Zone de saisie */}
      <View style={{ paddingHorizontal: 12, paddingBottom: TAB_BAR_CLEARANCE + insets.bottom - 14 }}>
        {waiting && (
          <Text variant="caption" tone="inkMuted" align="center" style={{ marginBottom: 6 }}>
            Confirmez ou refusez l'action proposée pour continuer.
          </Text>
        )}
        <View
          style={{
            backgroundColor: color.surfaceRaised,
            borderRadius: 28,
            paddingHorizontal: 8,
            paddingTop: files.length ? 8 : 4,
            paddingBottom: 8,
            shadowColor: color.night,
            shadowOpacity: 0.08,
            shadowRadius: 12,
            shadowOffset: { width: 0, height: 4 },
            elevation: 3,
          }}
        >
          {files.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 4, paddingBottom: 4 }}>
              {files.map((f) => (
                <FileChip key={f.id} file={f} onRemove={() => setFiles((all) => all.filter((x) => x.id !== f.id))} />
              ))}
            </ScrollView>
          )}
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder={waiting ? "En attente de votre accord" : "Écrivez ou dictez"}
            placeholderTextColor={color.inkMuted}
            editable={!waiting}
            multiline
            style={{ fontFamily: fontFamily.medium, fontSize: 16, lineHeight: 22, color: color.ink, maxHeight: 120, paddingHorizontal: 10, paddingTop: 10, paddingBottom: 6 }}
          />
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Pressable
              onPress={() => setAttachOpen(true)}
              disabled={waiting}
              accessibilityRole="button"
              accessibilityLabel="Joindre une photo ou un document"
              hitSlop={6}
              style={({ pressed }) => ({ width: 38, height: 38, borderRadius: 38, borderWidth: 1, borderColor: color.line, alignItems: "center", justifyContent: "center", opacity: waiting ? 0.4 : pressed ? 0.6 : 1 })}
            >
              <Plus size={20} strokeWidth={1.8} color={color.ink} />
            </Pressable>
            <Pressable
              onPress={() => send(input)}
              disabled={!canSend}
              accessibilityRole="button"
              accessibilityLabel="Envoyer"
              style={{ width: 38, height: 38, borderRadius: 38, alignItems: "center", justifyContent: "center", backgroundColor: canSend ? color.mint : color.surfaceSoft }}
            >
              <ArrowUp size={20} strokeWidth={2} color={canSend ? color.onMint : color.inkMuted} />
            </Pressable>
          </View>
        </View>
      </View>

      <Sheet visible={attachOpen} onClose={() => setAttachOpen(false)} title="Joindre">
        <AttachRow icon={Camera} title="Prendre une photo" subtitle="Facture, compteur, dégât" onPress={() => attach("camera")} />
        <AttachRow icon={ImagePlus} title="Choisir des photos" subtitle="Jusqu'à 4 à la fois" onPress={() => attach("library")} />
        <AttachRow icon={FileText} title="Choisir un PDF" subtitle="Bail, attestation, avis d'imposition" onPress={() => attach("pdf")} />
      </Sheet>
    </KeyboardAvoidingView>
  );
}

function HeaderIcon({ icon: Icon, label, onPress, disabled }: { icon: LucideIcon; label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={label} hitSlop={6} style={({ pressed }) => ({ width: 40, height: 40, borderRadius: 40, alignItems: "center", justifyContent: "center", opacity: disabled ? 0.3 : pressed ? 0.5 : 1 })}>
      <Icon size={22} strokeWidth={1.8} color={color.ink} />
    </Pressable>
  );
}

function AttachRow({ icon: Icon, title, subtitle, onPress }: { icon: LucideIcon; title: string; subtitle: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 12, opacity: pressed ? 0.6 : 1 })}>
      <View style={{ width: 44, height: 44, borderRadius: 44, backgroundColor: color.mintTint, alignItems: "center", justifyContent: "center" }}>
        <Icon size={22} strokeWidth={1.8} color={color.mintDeep} />
      </View>
      <View style={{ flex: 1 }}>
        <Text variant="rowTitle">{title}</Text>
        <Text variant="rowSubtitle" tone="inkMuted">
          {subtitle}
        </Text>
      </View>
    </Pressable>
  );
}

function FileChip({ file, onRemove }: { file: Attachment | AttachmentRef; onRemove?: () => void }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, height: 48, paddingLeft: 4, paddingRight: onRemove ? 4 : 12, borderRadius: 14, backgroundColor: color.surface, maxWidth: 220 }}>
      {file.kind === "image" ? (
        <Image source={{ uri: file.uri }} style={{ width: 40, height: 40, borderRadius: 10 }} />
      ) : (
        <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: color.dangerTint, alignItems: "center", justifyContent: "center" }}>
          <FileText size={20} strokeWidth={1.8} color={color.danger} />
        </View>
      )}
      <Text variant="caption" numberOfLines={1} style={{ flexShrink: 1 }}>
        {file.name}
      </Text>
      {onRemove && (
        <Pressable onPress={onRemove} hitSlop={8} accessibilityLabel={`Retirer ${file.name}`} style={{ width: 24, height: 24, borderRadius: 24, backgroundColor: color.surfaceSoft, alignItems: "center", justifyContent: "center" }}>
          <X size={14} strokeWidth={2} color={color.ink} />
        </Pressable>
      )}
    </View>
  );
}

/** Indicateur « l'agent écrit » : trois points qui pulsent. */
function Typing() {
  const dots = useRef([0, 1, 2].map(() => new Animated.Value(0.3))).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.stagger(
        160,
        dots.map((d) => Animated.sequence([Animated.timing(d, { toValue: 1, duration: 300, easing: Easing.out(Easing.quad), useNativeDriver: true }), Animated.timing(d, { toValue: 0.3, duration: 300, useNativeDriver: true })])),
      ),
    );
    loop.start();
    return () => loop.stop();
  }, []);
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 18 }} accessibilityLabel="L'agent travaille" accessibilityLiveRegion="polite">
      <KeyoMark size={24} />
      <View style={{ flexDirection: "row", gap: 5 }}>
        {dots.map((d, i) => (
          <Animated.View key={i} style={{ width: 7, height: 7, borderRadius: 7, backgroundColor: color.inkMuted, opacity: d }} />
        ))}
      </View>
    </View>
  );
}

const clean = (t: string) => t.replace(/\*\*(.+?)\*\*/g, "$1").replace(/^#+\s*/gm, "");

function Item({ item, busy, prev }: { item: FeedItem; busy: boolean; prev?: FeedItem }) {
  switch (item.kind) {
    case "user":
      return (
        <View style={{ alignItems: "flex-end", marginTop: 22, gap: 6 }}>
          {item.attachments?.map((a) =>
            a.kind === "image" ? (
              <Image key={a.id} source={{ uri: a.uri }} style={{ width: 180, height: 180, borderRadius: 20, backgroundColor: color.surfaceSoft }} accessibilityLabel={a.name} />
            ) : (
              <FileChip key={a.id} file={a} />
            ),
          )}
          {item.text ? (
            <View style={{ maxWidth: "82%", backgroundColor: color.night, borderRadius: 22, borderBottomRightRadius: 6, paddingHorizontal: 16, paddingVertical: 11 }}>
              <Text variant="body" tone="onNight">
                {item.text}
              </Text>
            </View>
          ) : null}
        </View>
      );
    case "agent": {
      const lines = clean(item.text).split("\n");
      const sources = lines.filter((l) => /^sources\s*:/i.test(l.trim())).join(" ");
      const body = lines.filter((l) => !/^sources\s*:/i.test(l.trim())).join("\n").trim();
      const grouped = prev?.kind === "agent" || prev?.kind === "activity" || prev?.kind === "proposal";
      return (
        <View style={{ marginTop: grouped ? 10 : 22, flexDirection: "row", gap: 10 }}>
          <View style={{ width: 24 }}>{!grouped && <KeyoMark size={24} />}</View>
          <View style={{ flex: 1, gap: 8 }}>
            <Text variant="body" selectable style={{ lineHeight: 24 }}>
              {body}
            </Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <Pressable onPress={() => speak(item.text)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Lire à voix haute">
                <Volume2 size={18} strokeWidth={1.8} color={color.inkMuted} />
              </Pressable>
              {sources ? (
                <Text variant="caption" tone="inkMuted" style={{ flex: 1 }} numberOfLines={2}>
                  {sources}
                </Text>
              ) : null}
            </View>
          </View>
        </View>
      );
    }
    case "activity":
      return (
        <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
          <View style={{ width: 24 }}>{prev?.kind !== "agent" && prev?.kind !== "activity" && <KeyoMark size={24} />}</View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: color.surfaceRaised }}>
            {item.ok ? <Check size={14} strokeWidth={2} color={color.mintDeep} /> : <CircleAlert size={14} strokeWidth={1.8} color={color.danger} />}
            <Text variant="caption" tone="inkMuted">
              {item.label}
            </Text>
          </View>
        </View>
      );
    case "proposal": {
      const pending = item.status === "pending";
      return (
        <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
          <View style={{ width: 24 }} />
          <View style={{ flex: 1, backgroundColor: color.surfaceRaised, borderRadius: radius.card, padding: 16, gap: 12, borderWidth: 1.5, borderColor: pending ? color.mint : color.line }}>
            <Text variant="caption" tone="inkMuted" style={{ fontFamily: fontFamily.bold }}>
              {pending ? "Votre accord" : item.status === "done" ? "Fait" : item.status === "declined" ? "Refusé" : "Échec"}
            </Text>
            <Text variant="rowTitle">{item.description}</Text>
            {pending ? (
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Pill label="Refuser" onPress={() => conversation.decide(item.id, false)} disabled={busy} />
                <Pill label="Confirmer" strong onPress={() => conversation.decide(item.id, true)} disabled={busy} />
              </View>
            ) : item.result ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <View style={{ width: 7, height: 7, borderRadius: 7, backgroundColor: item.status === "done" ? color.dotPaid : color.dotDanger }} />
                <Text variant="caption" tone="inkMuted" style={{ flex: 1 }}>
                  {item.result}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
      );
    }
    case "error":
      return (
        <View style={{ flexDirection: "row", gap: 10, marginTop: 14 }}>
          <View style={{ width: 24 }} />
          <View style={{ flex: 1, flexDirection: "row", gap: 8, padding: 12, borderRadius: 16, backgroundColor: color.dangerTint }}>
            <CircleAlert size={18} strokeWidth={1.8} color={color.danger} />
            <Text variant="rowSubtitle" tone="danger" style={{ flex: 1 }}>
              {item.text}
            </Text>
          </View>
        </View>
      );
  }
}

/** Boutons de la carte d'accord, plus petits que le bouton principal. */
function Pill({ label, onPress, strong, disabled }: { label: string; onPress: () => void; strong?: boolean; disabled?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={({ pressed }) => ({ flex: 1, height: 44, borderRadius: 999, alignItems: "center", justifyContent: "center", backgroundColor: strong ? color.mint : color.surfaceSoft, opacity: disabled ? 0.4 : pressed ? 0.8 : 1 })}
    >
      <Text variant="rowTitle" tone={strong ? "onMint" : "ink"}>
        {label}
      </Text>
    </Pressable>
  );
}
