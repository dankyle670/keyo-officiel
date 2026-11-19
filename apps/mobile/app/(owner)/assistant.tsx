import { useEffect, useRef, useState, type ComponentRef } from "react";
import { Alert, Animated, Easing, Image, KeyboardAvoidingView, Pressable, ScrollView, Share, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ArrowUp,
  Cable,
  Camera,
  Check,
  CircleAlert,
  Copy,
  FileText,
  History,
  ImagePlus,
  Menu,
  Plus,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal,
  Square,
  SquarePen,
  Trash2,
  Volume2,
  Wallet,
  Workflow,
  X,
  type LucideIcon,
} from "lucide-react-native";
import { color, fontFamily, radius } from "@keyo/tokens";
import { pickImages, pickPdf, type Attachment } from "@/agent/attachments";
import { conversation, speak, useConversation, type AttachmentRef, type FeedItem } from "@/agent/conversation";
import { autonomousApi, type ConnectorInfo } from "@/autonomous/api";
import { KeyoMark } from "@/brand/Logo";
import { sinceLabel } from "@/data/period";
import { session, useSettings, useUser } from "@/data/session";
import { Markdown, Sheet, Status, TAB_BAR_CLEARANCE, Text, ToggleRow } from "@/ui";

const SUGGESTIONS: { icon: LucideIcon; title: string; prompt: string }[] = [
  { icon: Workflow, title: "Qu'avez-vous fait en mon absence ?", prompt: "Qu'as-tu fait en mon absence, et qu'est-ce qui attend mon accord ?" },
  { icon: ShieldCheck, title: "Tout est en ordre ?", prompt: "Est-ce que tout est en ordre ?" },
  { icon: Wallet, title: "Loyers en retard", prompt: "Qui paie en retard ?" },
  { icon: FileText, title: "Rapport du mois", prompt: "Fais-moi le rapport du mois" },
];

/** Copier passe par la feuille de partage du système, qui propose « Copier ». */
const share = (text: string) => void Share.share({ message: text }).catch(() => undefined);
const clean = (t: string) =>
  t
    .split("\n")
    .filter((l) => !/^sources\s*:/i.test(l.trim()))
    .join("\n")
    .trim();

/**
 * Agent Keyo : conversation épurée, écrite ou dictée (dictée du clavier), avec photos et PDF,
 * historique des conversations, arrêt, régénération et modification d'un message.
 * Le menu « + » regroupe les pièces jointes, les connecteurs et les réglages rapides de l'agent.
 */
export default function Agent() {
  const insets = useSafeAreaInsets();
  const user = useUser();
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const field = useRef<ComponentRef<typeof TextInput>>(null);
  const c = useConversation();
  const [input, setInput] = useState("");
  const [files, setFiles] = useState<Attachment[]>([]);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [userMenu, setUserMenu] = useState<Extract<FeedItem, { kind: "user" }>>();
  const params = useLocalSearchParams<{ prompt?: string; k?: string }>();
  const handled = useRef<string | undefined>(undefined);
  const waiting = c.feed.some((f) => f.kind === "proposal" && f.status === "pending");
  const canSend = (input.trim().length > 0 || files.length > 0) && !c.busy && !waiting;
  const lastAgent = [...c.feed].reverse().find((f) => f.kind === "agent")?.id;

  // Demande envoyée depuis un autre écran (Contrôle de gestion, Aide, Évaluation).
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
    if (c.busy || waiting || (!text.trim() && !files.length)) return;
    const toSend = files;
    setInput("");
    setFiles([]);
    conversation.send(text, toSend);
  };

  const attach = async (source: "camera" | "library" | "pdf") => {
    setToolsOpen(false);
    // Laisser la feuille se fermer avant d'ouvrir le sélecteur du système.
    await new Promise((r) => setTimeout(r, 350));
    const picked = source === "pdf" ? await pickPdf() : await pickImages(source === "camera");
    setFiles((f) => [...f, ...picked].slice(0, 4));
  };

  const go = (href: string) => {
    setToolsOpen(false);
    setHistoryOpen(false);
    router.push(href as never);
  };

  const edit = (item: Extract<FeedItem, { kind: "user" }>) => {
    setUserMenu(undefined);
    const text = conversation.editFrom(item.id);
    if (text !== null) {
      setInput(text);
      setTimeout(() => field.current?.focus(), 300);
    }
  };

  const empty = c.feed.length === 0;
  const status = c.mode === "claude" ? "En ligne" : c.mode === "demo" ? (c.offline ? "Hors ligne, mode démo" : "Mode démo") : "Prêt";

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: color.surface }} behavior="padding">
      {/* En-tête : historique, nom et état, nouvelle conversation */}
      <View style={{ paddingTop: insets.top + 6, paddingHorizontal: 12, paddingBottom: 6, flexDirection: "row", alignItems: "center", gap: 4 }}>
        <HeaderIcon icon={Menu} label="Conversations" onPress={() => setHistoryOpen(true)} />
        <View style={{ flex: 1, alignItems: "center" }}>
          <Text variant="rowTitle" style={{ fontFamily: fontFamily.extrabold }} accessibilityRole="header" numberOfLines={1}>
            {empty ? "Agent Keyo" : c.title}
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
            <View style={{ width: 7, height: 7, borderRadius: 7, backgroundColor: c.mode === "claude" ? color.dotPaid : c.mode === "demo" ? color.dotLate : color.track }} />
            <Text variant="caption" tone="inkMuted">
              {status}
            </Text>
          </View>
        </View>
        <HeaderIcon icon={SquarePen} label="Nouvelle conversation" onPress={() => conversation.newThread()} disabled={empty || c.busy} />
      </View>

      <ScrollView ref={scroll} keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 20, paddingBottom: 16 }}>
        {empty ? (
          <View style={{ flex: 1, justifyContent: "center", paddingVertical: 24 }}>
            <KeyoMark size={40} />
            <Text variant="title" style={{ fontSize: 28, lineHeight: 34, marginTop: 18 }}>
              Bonjour {user.firstName},
            </Text>
            <Text variant="title" tone="inkMuted" style={{ fontSize: 28, lineHeight: 34 }}>
              que puis-je faire pour vous ?
            </Text>
            <View style={{ marginTop: 28, gap: 8 }}>
              {SUGGESTIONS.map((s) => (
                <Pressable
                  key={s.title}
                  onPress={() => conversation.send(s.prompt)}
                  accessibilityRole="button"
                  style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 13, paddingHorizontal: 14, borderRadius: 20, backgroundColor: color.surfaceRaised, opacity: pressed ? 0.7 : 1 })}
                >
                  <s.icon size={20} strokeWidth={1.8} color={color.mintDeep} />
                  <Text variant="rowTitle" style={{ flex: 1 }}>
                    {s.title}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : (
          c.feed.map((f, i) => <Item key={f.id} item={f} busy={c.busy} prev={c.feed[i - 1]} isLastAgent={f.id === lastAgent} onUserMenu={setUserMenu} />)
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
            ref={field}
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
              onPress={() => setToolsOpen(true)}
              disabled={waiting}
              accessibilityRole="button"
              accessibilityLabel="Joindre, connecteurs et réglages"
              hitSlop={6}
              style={({ pressed }) => ({ width: 38, height: 38, borderRadius: 38, borderWidth: 1, borderColor: color.line, alignItems: "center", justifyContent: "center", opacity: waiting ? 0.4 : pressed ? 0.6 : 1 })}
            >
              <Plus size={20} strokeWidth={1.8} color={color.ink} />
            </Pressable>
            {c.busy ? (
              <Pressable
                onPress={() => conversation.stop()}
                accessibilityRole="button"
                accessibilityLabel="Arrêter la réponse"
                style={{ width: 38, height: 38, borderRadius: 38, alignItems: "center", justifyContent: "center", backgroundColor: color.night }}
              >
                <Square size={14} strokeWidth={2} color={color.onNight} fill={color.onNight} />
              </Pressable>
            ) : (
              <Pressable
                onPress={() => send(input)}
                disabled={!canSend}
                accessibilityRole="button"
                accessibilityLabel="Envoyer"
                style={{ width: 38, height: 38, borderRadius: 38, alignItems: "center", justifyContent: "center", backgroundColor: canSend ? color.mint : color.surfaceSoft }}
              >
                <ArrowUp size={20} strokeWidth={2} color={canSend ? color.onMint : color.inkMuted} />
              </Pressable>
            )}
          </View>
        </View>
      </View>

      <ToolsSheet visible={toolsOpen} onClose={() => setToolsOpen(false)} onAttach={attach} onGo={go} />
      <HistorySheet visible={historyOpen} onClose={() => setHistoryOpen(false)} onGo={go} />

      <Sheet visible={Boolean(userMenu)} onClose={() => setUserMenu(undefined)} title="Votre message">
        {userMenu && (
          <>
            <MenuRow icon={SquarePen} title="Modifier et renvoyer" subtitle="La conversation reprend à ce message" onPress={() => edit(userMenu)} disabled={c.busy} />
            <MenuRow
              icon={Copy}
              title="Copier ou partager"
              onPress={() => {
                setUserMenu(undefined);
                share(userMenu.text);
              }}
            />
          </>
        )}
      </Sheet>
    </KeyboardAvoidingView>
  );
}

/** Menu « + » : joindre, connecteurs de l'agent, réglages rapides. */
function ToolsSheet({ visible, onClose, onAttach, onGo }: { visible: boolean; onClose: () => void; onAttach: (s: "camera" | "library" | "pdf") => void; onGo: (href: string) => void }) {
  const settings = useSettings();
  const [connectors, setConnectors] = useState<ConnectorInfo[] | null>(null);
  useEffect(() => {
    if (!visible) return;
    autonomousApi
      .connectors()
      .then(setConnectors)
      .catch(() => setConnectors([]));
  }, [visible]);
  const shown = (connectors ?? []).filter((x) => x.channel !== "APP");

  return (
    <Sheet visible={visible} onClose={onClose}>
      <ScrollView style={{ maxHeight: 560 }} showsVerticalScrollIndicator={false}>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Tile icon={Camera} label="Photo" onPress={() => onAttach("camera")} />
          <Tile icon={ImagePlus} label="Photos" onPress={() => onAttach("library")} />
          <Tile icon={FileText} label="PDF" onPress={() => onAttach("pdf")} />
        </View>

        <SheetLabel>Connecteurs</SheetLabel>
        <View style={{ borderRadius: radius.card, backgroundColor: color.surfaceRaised, paddingHorizontal: 14 }}>
          {connectors === null && (
            <Text variant="rowSubtitle" tone="inkMuted" style={{ paddingVertical: 14 }}>
              Chargement…
            </Text>
          )}
          {connectors !== null && shown.length === 0 && (
            <Text variant="rowSubtitle" tone="inkMuted" style={{ paddingVertical: 14 }}>
              Serveur Keyo injoignable : les connecteurs ne sont pas disponibles.
            </Text>
          )}
          {shown.map((x, i) => (
            <View key={x.channel} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12, borderTopWidth: i ? 1 : 0, borderTopColor: color.line }}>
              <Text variant="rowTitle" style={{ flex: 1 }}>
                {x.label.replace(" (simulé)", "")}
              </Text>
              {x.simulated ? <Status tone="neutral" label="Simulé" /> : <Status tone="paid" label="Connecté" />}
            </View>
          ))}
        </View>
        <MenuRow icon={Cable} title="Gérer les connexions" onPress={() => onGo("/agent/connexions")} />

        <SheetLabel>Agent</SheetLabel>
        <View style={{ borderRadius: radius.card, backgroundColor: color.surfaceRaised, paddingHorizontal: 14 }}>
          <ToggleRow
            title="Accord à chaque action"
            subtitle={settings.agentConfirm === "ALWAYS" ? "Vous validez toute modification" : "Seulement l'argent, les occupants et les messages"}
            value={settings.agentConfirm === "ALWAYS"}
            onChange={(v) => session.updateSettings({ agentConfirm: v ? "ALWAYS" : "RISKY" })}
          />
          <View style={{ height: 1, backgroundColor: color.line }} />
          <ToggleRow title="Lire les réponses à voix haute" value={settings.agentSpeaks} onChange={(v) => session.updateSettings({ agentSpeaks: v })} />
        </View>
        <MenuRow icon={SlidersHorizontal} title="Autonomie en votre absence" onPress={() => onGo("/agent/autonomie")} />
        <MenuRow icon={Workflow} title="Ce que Keyo a fait" onPress={() => onGo("/agent")} />
      </ScrollView>
    </Sheet>
  );
}

/** Historique : la conversation ouverte puis les précédentes. Appui long pour supprimer. */
function HistorySheet({ visible, onClose, onGo }: { visible: boolean; onClose: () => void; onGo: (href: string) => void }) {
  const c = useConversation();
  const threads = [...(c.feed.length ? [{ id: c.id, title: c.title, updatedAt: c.updatedAt }] : []), ...c.archive];
  const remove = (id: string, title: string) =>
    Alert.alert("Supprimer la conversation ?", title, [
      { text: "Annuler", style: "cancel" },
      { text: "Supprimer", style: "destructive", onPress: () => conversation.deleteThread(id) },
    ]);

  return (
    <Sheet visible={visible} onClose={onClose} title="Conversations">
      <MenuRow
        icon={SquarePen}
        title="Nouvelle conversation"
        onPress={() => {
          conversation.newThread();
          onClose();
        }}
        disabled={c.busy || !c.feed.length}
      />
      <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
        {threads.length === 0 && (
          <Text variant="rowSubtitle" tone="inkMuted" style={{ paddingVertical: 14 }}>
            Vos conversations apparaîtront ici.
          </Text>
        )}
        {threads.map((t) => {
          const active = t.id === c.id;
          return (
            <Pressable
              key={t.id}
              onPress={() => {
                conversation.openThread(t.id);
                onClose();
              }}
              onLongPress={() => remove(t.id, t.title)}
              accessibilityRole="button"
              accessibilityHint="Appui long pour supprimer"
              style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 12, borderRadius: 16, backgroundColor: active ? color.surfaceRaised : "transparent", opacity: pressed ? 0.6 : 1 })}
            >
              <View style={{ flex: 1 }}>
                <Text variant="rowTitle" numberOfLines={1}>
                  {t.title}
                </Text>
                <Text variant="caption" tone="inkMuted">
                  {active ? "Ouverte" : sinceLabel(t.updatedAt)}
                </Text>
              </View>
              <Pressable onPress={() => remove(t.id, t.title)} hitSlop={10} accessibilityLabel={`Supprimer ${t.title}`}>
                <Trash2 size={18} strokeWidth={1.8} color={color.inkMuted} />
              </Pressable>
            </Pressable>
          );
        })}
      </ScrollView>
      <MenuRow icon={History} title="Ce que Keyo a fait en votre absence" onPress={() => onGo("/agent")} />
    </Sheet>
  );
}

function SheetLabel({ children }: { children: string }) {
  return (
    <Text variant="caption" tone="inkMuted" style={{ marginTop: 20, marginBottom: 8, marginLeft: 4, textTransform: "uppercase", letterSpacing: 0.8, fontFamily: fontFamily.bold }}>
      {children}
    </Text>
  );
}

function Tile({ icon: Icon, label, onPress }: { icon: LucideIcon; label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => ({ flex: 1, height: 84, borderRadius: 20, backgroundColor: color.surfaceRaised, alignItems: "center", justifyContent: "center", gap: 6, opacity: pressed ? 0.6 : 1 })}
    >
      <Icon size={24} strokeWidth={1.8} color={color.mintDeep} />
      <Text variant="caption">{label}</Text>
    </Pressable>
  );
}

function MenuRow({ icon: Icon, title, subtitle, onPress, disabled }: { icon: LucideIcon; title: string; subtitle?: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 12, paddingHorizontal: 4, opacity: disabled ? 0.4 : pressed ? 0.6 : 1 })}>
      <Icon size={22} strokeWidth={1.8} color={color.ink} />
      <View style={{ flex: 1 }}>
        <Text variant="rowTitle">{title}</Text>
        {subtitle ? (
          <Text variant="caption" tone="inkMuted">
            {subtitle}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

function HeaderIcon({ icon: Icon, label, onPress, disabled }: { icon: LucideIcon; label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={label} hitSlop={6} style={({ pressed }) => ({ width: 40, height: 40, borderRadius: 40, alignItems: "center", justifyContent: "center", opacity: disabled ? 0.3 : pressed ? 0.5 : 1 })}>
      <Icon size={22} strokeWidth={1.8} color={color.ink} />
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

function ActionIcon({ icon: Icon, label, onPress, disabled }: { icon: LucideIcon; label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} hitSlop={10} accessibilityRole="button" accessibilityLabel={label} style={({ pressed }) => ({ opacity: disabled ? 0.3 : pressed ? 0.5 : 1 })}>
      <Icon size={18} strokeWidth={1.8} color={color.inkMuted} />
    </Pressable>
  );
}

function Item({
  item,
  busy,
  prev,
  isLastAgent,
  onUserMenu,
}: {
  item: FeedItem;
  busy: boolean;
  prev?: FeedItem;
  isLastAgent: boolean;
  onUserMenu: (u: Extract<FeedItem, { kind: "user" }>) => void;
}) {
  switch (item.kind) {
    case "user":
      return (
        <Pressable onLongPress={() => onUserMenu(item)} delayLongPress={300} style={{ alignItems: "flex-end", marginTop: 22, gap: 6 }} accessibilityHint="Appui long pour modifier ou copier">
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
        </Pressable>
      );
    case "agent": {
      const lines = item.text.split("\n");
      const sources = lines.filter((l) => /^sources\s*:/i.test(l.trim())).join(" ");
      const body = clean(item.text);
      const grouped = prev?.kind === "agent" || prev?.kind === "activity" || prev?.kind === "proposal";
      return (
        <View style={{ marginTop: grouped ? 10 : 22, flexDirection: "row", gap: 10 }}>
          <View style={{ width: 24 }}>{!grouped && <KeyoMark size={24} />}</View>
          <View style={{ flex: 1, gap: 8 }}>
            <Markdown text={body} />
            {item.link && (
              <Pressable
                onPress={() => router.push(item.link!.href as never)}
                accessibilityRole="button"
                style={({ pressed }) => ({ alignSelf: "flex-start", height: 44, paddingHorizontal: 18, borderRadius: 999, justifyContent: "center", backgroundColor: color.surfaceRaised, borderWidth: 1.5, borderColor: color.mint, opacity: pressed ? 0.7 : 1 })}
              >
                <Text variant="rowTitle">{item.link.label}</Text>
              </Pressable>
            )}
            {sources ? (
              <Text variant="caption" tone="inkMuted" numberOfLines={2}>
                {sources}
              </Text>
            ) : null}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 18, marginTop: 2 }}>
              <ActionIcon icon={Copy} label="Copier ou partager" onPress={() => share(body)} />
              <ActionIcon icon={Volume2} label="Lire à voix haute" onPress={() => speak(item.text)} />
              {isLastAgent && <ActionIcon icon={RefreshCw} label="Régénérer la réponse" onPress={() => conversation.regenerate()} disabled={busy} />}
            </View>
          </View>
        </View>
      );
    }
    case "activity":
      return (
        <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
          <View style={{ width: 24 }}>{prev?.kind !== "agent" && prev?.kind !== "activity" && <KeyoMark size={24} />}</View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: color.surfaceRaised, maxWidth: "100%" }}>
            {item.ok ? <Check size={14} strokeWidth={2} color={color.mintDeep} /> : <CircleAlert size={14} strokeWidth={1.8} color={color.danger} />}
            <Text variant="caption" tone="inkMuted" numberOfLines={2} style={{ flexShrink: 1 }}>
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
