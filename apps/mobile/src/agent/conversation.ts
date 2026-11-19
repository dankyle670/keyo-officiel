import { useSyncExternalStore } from "react";
import * as Speech from "expo-speech";
import { AGENT_TOOLS, isAgentTool, needsConfirmation } from "@keyo/shared";
import { KEYS, load, remove, save } from "@/data/persist";
import { getSession, getSettings } from "@/data/session";
import { agentMode, AgentUnavailable, postTurn, type ApiMessage, type ContentBlock } from "./api";
import { toContentBlock, type Attachment } from "./attachments";
import { demoAttachmentReply, demoReply } from "./demo";
import { demoAutonomyReply } from "./demoAutonomy";
import { describeAction, executeTool, turnContext } from "./tools";

/**
 * Conversation avec l'agent Keyo. La boucle d'agent tourne ici : le serveur relaie vers Claude,
 * l'app exécute les outils sur ses données et renvoie les résultats. Les actions qui modifient
 * les données attendent l'accord du propriétaire (carte de confirmation).
 */
export type FeedItem =
  | { id: string; kind: "user"; text: string; attachments?: AttachmentRef[] }
  | { id: string; kind: "agent"; text: string; link?: { label: string; href: string } }
  | { id: string; kind: "activity"; label: string; ok: boolean }
  | { id: string; kind: "proposal"; toolUseId: string; name: string; input: Record<string, unknown>; description: string; status: "pending" | "done" | "declined" | "failed"; result?: string }
  | { id: string; kind: "error"; text: string };

/** Pièce jointe gardée sur le téléphone (sans son contenu encodé). */
export type AttachmentRef = { id: string; name: string; uri: string; kind: "image" | "pdf" };

type ToolResult = { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean };

type State = {
  feed: FeedItem[];
  /** Historique au format Claude, renvoyé tel quel au serveur à chaque tour. */
  history: ApiMessage[];
  /** Résultats d'outils du tour en cours, dans l'ordre des demandes, en attente des confirmations. */
  pending: { order: string[]; results: Record<string, ToolResult> } | null;
  busy: boolean;
  mode: "claude" | "demo" | "unknown";
  /** Serveur injoignable : mode démo par défaut. */
  offline: boolean;
  /** Pièces jointes de la conversation, que l'agent peut classer (outil file_document). */
  attachments: Record<string, AttachmentRef>;
};

const MAX_STEPS = 12;
let state: State = { feed: [], history: [], pending: null, busy: false, mode: "unknown", offline: false, attachments: {} };
const listeners = new Set<() => void>();
const set = (patch: Partial<State>) => {
  state = { ...state, ...patch };
  const { feed, history, pending, attachments } = state;
  save(KEYS.agent, { feed: feed.slice(-200), history, pending, attachments });
  listeners.forEach((l) => l());
};

let seq = 0;
const id = () => `f-${Date.now().toString(36)}-${(seq++).toString(36)}`;
const push = (...items: FeedItem[]) => set({ feed: [...state.feed, ...items] });

export const getAttachment = (id: string) => state.attachments[id];

export function useConversation(): State {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}

/** Texte lu à voix haute : sans la ligne des sources ni la mise en forme. */
export function speak(text: string) {
  const clean = text
    .split("\n")
    .filter((l) => !/^sources\s*:/i.test(l.trim()))
    .join(". ")
    .replace(/[*#_`]/g, "");
  Speech.stop();
  Speech.speak(clean, { language: "fr-FR", rate: 1.0 });
}

function sayAgent(text: string, link?: { label: string; href: string }) {
  if (!text.trim()) return;
  push({ id: id(), kind: "agent", text: text.trim(), link });
  if (getSettings().agentSpeaks) speak(text);
}

const policy = () => getSettings().agentConfirm;

async function ensureMode() {
  if (state.mode !== "unknown" && !state.offline) return state.mode;
  const m = await agentMode();
  set({ mode: m.mode, offline: !m.reachable });
  return m.mode;
}

/** Un ou plusieurs tours avec Claude, jusqu'à une réponse finale ou une confirmation attendue. */
async function runClaude(steps = 0): Promise<void> {
  if (steps >= MAX_STEPS) {
    push({ id: id(), kind: "error", text: "L'agent a enchaîné trop d'étapes. Reformulez votre demande." });
    return;
  }
  const res = await postTurn(state.history, turnContext());
  set({ history: [...state.history, { role: "assistant", content: res.content as Record<string, unknown>[] }] });

  if (res.stop_reason === "refusal") {
    sayAgent("Je ne peux pas traiter cette demande. Reformulez-la, ou passez par les écrans de l'app.");
    return;
  }
  const text = res.content.filter((b): b is { type: "text"; text: string } => b.type === "text").map((b) => b.text).join("\n");
  sayAgent(text);
  if (res.stop_reason === "max_tokens") push({ id: id(), kind: "error", text: "Réponse interrompue : elle était trop longue." });
  if (res.stop_reason !== "tool_use") return;

  const uses = res.content.filter((b): b is { type: "tool_use"; id: string; name: string; input: Record<string, unknown> } => b.type === "tool_use");
  const pending: NonNullable<State["pending"]> = { order: uses.map((u) => u.id), results: {} };
  set({ pending });
  for (const u of uses) {
    if (isAgentTool(u.name) && needsConfirmation(u.name, policy())) {
      push({ id: id(), kind: "proposal", toolUseId: u.id, name: u.name, input: u.input ?? {}, description: describeAction(u.name, u.input ?? {}), status: "pending" });
      continue;
    }
    const out = await executeTool(u.name, u.input);
    push({ id: id(), kind: "activity", label: out.ok ? `${labelOf(u.name)} : ${out.summary}` : `${labelOf(u.name)} : échec`, ok: out.ok });
    record(u.id, out.ok ? { content: JSON.stringify(out.result) } : { content: out.error, is_error: true });
  }
  await flushIfComplete(steps);
}

const labelOf = (name: string) => (isAgentTool(name) ? AGENT_TOOLS[name].label : name);

function record(toolUseId: string, r: { content: string; is_error?: boolean }) {
  if (!state.pending) return;
  set({ pending: { ...state.pending, results: { ...state.pending.results, [toolUseId]: { type: "tool_result", tool_use_id: toolUseId, ...r } } } });
}

/** Tous les outils du tour ont un résultat : on les renvoie ensemble, dans un seul message. */
async function flushIfComplete(steps: number) {
  const p = state.pending;
  if (!p || p.order.some((k) => !p.results[k])) return;
  const results = p.order.map((k) => p.results[k]!);
  set({ pending: null, history: [...state.history, { role: "user", content: results }] });
  await runClaude(steps + 1);
}

async function guard(task: () => Promise<void>) {
  set({ busy: true });
  try {
    await task();
  } catch (e) {
    if (e instanceof AgentUnavailable) {
      set({ mode: "demo" });
      push({ id: id(), kind: "error", text: "L'agent IA n'est pas configuré sur le serveur : mode démo." });
    } else {
      push({ id: id(), kind: "error", text: e instanceof Error && e.message !== "Aborted" ? e.message : "Pas de réponse du serveur. Vérifiez la connexion et réessayez." });
    }
  } finally {
    set({ busy: false });
  }
}

export const conversation = {
  async hydrate() {
    const saved = await load<Pick<State, "feed" | "history" | "pending" | "attachments">>(KEYS.agent);
    if (saved) state = { ...state, ...saved };
    listeners.forEach((l) => l());
  },

  async send(raw: string, files: Attachment[] = []) {
    const text = raw.trim() || (files.length ? "Voici un document." : "");
    if (!text || state.busy || state.pending) return;
    Speech.stop();
    const refs: AttachmentRef[] = files.map(({ id: aid, name, uri, kind }) => ({ id: aid, name, uri, kind }));
    push({ id: id(), kind: "user", text: raw.trim(), attachments: refs.length ? refs : undefined });
    set({ attachments: { ...state.attachments, ...Object.fromEntries(refs.map((r) => [r.id, r])) } });
    await guard(async () => {
      const mode = await ensureMode();
      if (mode === "claude") {
        const note = refs.length ? `\n\n[Pièces jointes : ${refs.map((r) => `${r.id} « ${r.name} » (${r.kind === "pdf" ? "PDF" : "photo"})`).join(", ")}]` : "";
        const content = files.length ? [...files.map(toContentBlock), { type: "text", text: text + note }] : text;
        set({ history: [...state.history, { role: "user", content }] });
        await runClaude();
        return;
      }
      const s = getSession();
      const auto = refs.length ? null : await demoAutonomyReply(text);
      const r = auto ?? (refs.length ? demoAttachmentReply(refs[0]!, text) : demoReply(text, s.status === "signedIn" ? s.user.displayCurrency : "XOF"));
      sayAgent(r.text, r.link);
      if (r.proposal) push({ id: id(), kind: "proposal", toolUseId: `demo-${id()}`, name: r.proposal.name, input: r.proposal.input, description: describeAction(r.proposal.name, r.proposal.input), status: "pending" });
    });
  },

  /** Réponse du propriétaire à une carte de confirmation. */
  async decide(itemId: string, approve: boolean) {
    const item = state.feed.find((f): f is Extract<FeedItem, { kind: "proposal" }> => f.id === itemId && f.kind === "proposal");
    if (!item || item.status !== "pending" || state.busy) return;
    const update = (patch: Partial<typeof item>) => set({ feed: state.feed.map((f) => (f.id === itemId ? ({ ...f, ...patch } as FeedItem) : f)) });
    await guard(async () => {
      if (!approve) {
        update({ status: "declined" });
        record(item.toolUseId, { content: "Le propriétaire a refusé cette action. Ne la refaites pas sans nouvelle demande." });
      } else {
        const out = await executeTool(item.name, item.input);
        update(out.ok ? { status: "done", result: out.summary } : { status: "failed", result: out.error });
        record(item.toolUseId, out.ok ? { content: JSON.stringify(out.result) } : { content: out.error, is_error: true });
      }
      if (item.toolUseId.startsWith("demo-")) return;
      await flushIfComplete(0);
    });
  },

  async reset() {
    Speech.stop();
    await remove(KEYS.agent);
    state = { ...state, feed: [], history: [], pending: null, mode: "unknown", offline: false, attachments: {} };
    listeners.forEach((l) => l());
  },

  /** Revérifie la disponibilité du serveur (après ajout de la clé, par exemple). */
  async refreshMode() {
    state = { ...state, mode: "unknown" };
    await ensureMode();
  },
};
