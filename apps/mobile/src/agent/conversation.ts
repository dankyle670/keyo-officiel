import { useSyncExternalStore } from "react";
import * as Speech from "expo-speech";
import { AGENT_TOOLS, isAgentTool, needsConfirmation } from "@keyo/shared";
import { KEYS, load, remove, save } from "@/data/persist";
import { getSession, getSettings } from "@/data/session";
import { agentMode, AgentUnavailable, apiBase, postTurn, type ApiMessage } from "./api";
import { toContentBlock, type Attachment } from "./attachments";
import { demoAttachmentReply, demoReply } from "./demo";
import { demoAutonomyReply } from "./demoAutonomy";
import { describeAction, executeTool, turnContext } from "./tools";

/**
 * Conversations avec l'agent Keyo. La boucle d'agent tourne ici : le serveur relaie vers Claude,
 * l'app exécute les outils sur ses données et renvoie les résultats. Les actions qui modifient
 * les données attendent l'accord du propriétaire (carte de confirmation).
 * Plusieurs conversations sont gardées sur le téléphone (historique), comme dans une app de chat.
 */
export type FeedItem =
  /** `hist` : longueur de l'historique Claude avant ce message (pour régénérer ou modifier). */
  | { id: string; kind: "user"; text: string; attachments?: AttachmentRef[]; hist?: number }
  | { id: string; kind: "agent"; text: string; link?: { label: string; href: string } }
  | { id: string; kind: "activity"; label: string; ok: boolean }
  | { id: string; kind: "proposal"; toolUseId: string; name: string; input: Record<string, unknown>; description: string; status: "pending" | "done" | "declined" | "failed"; result?: string }
  | { id: string; kind: "error"; text: string };

/** Pièce jointe gardée sur le téléphone (sans son contenu encodé). */
export type AttachmentRef = { id: string; name: string; uri: string; kind: "image" | "pdf" };

type ToolResult = { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean };

/** Une conversation : le fil affiché et l'historique au format Claude, renvoyé tel quel au serveur. */
export type Thread = {
  id: string;
  title: string;
  updatedAt: string;
  feed: FeedItem[];
  history: ApiMessage[];
  /** Résultats d'outils du tour en cours, dans l'ordre des demandes, en attente des confirmations. */
  pending: { order: string[]; results: Record<string, ToolResult> } | null;
  /** Pièces jointes de la conversation, que l'agent peut classer (outil file_document). */
  attachments: Record<string, AttachmentRef>;
  /** Connue du serveur mais pas encore téléchargée sur ce téléphone. */
  remote?: boolean;
};

type State = Thread & {
  /** Autres conversations, la plus récente en premier (sans la conversation ouverte). */
  archive: Thread[];
  busy: boolean;
  mode: "claude" | "demo" | "unknown";
  /** Serveur injoignable : mode démo par défaut. */
  offline: boolean;
};

const MAX_STEPS = 12;
const MAX_THREADS = 40;
let seq = 0;
const id = () => `f-${Date.now().toString(36)}-${(seq++).toString(36)}`;
const blank = (): Thread => ({ id: `c-${id()}`, title: "Nouvelle conversation", updatedAt: new Date().toISOString(), feed: [], history: [], pending: null, attachments: {} });

let state: State = { ...blank(), archive: [], busy: false, mode: "unknown", offline: false };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

const threadOf = (s: State): Thread => ({ id: s.id, title: s.title, updatedAt: s.updatedAt, feed: s.feed.slice(-200), history: s.history, pending: s.pending, attachments: s.attachments });
const persist = () => {
  save(KEYS.agent, { v: 2, active: threadOf(state), archive: state.archive });
  schedulePush();
};

/**
 * Copie des conversations sur le serveur (apps/api, /conversations) : elles survivent à un
 * changement de téléphone et l'équipe peut les relire. Hors ligne, l'envoi est retenté plus tard.
 */
const ownerId = () => {
  const s = getSession();
  return s.status === "signedIn" ? s.user.id.replace(/[^\w-]/g, "").slice(0, 64) : "";
};
async function remote<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const o = ownerId();
  if (!o) throw new Error("Session absente");
  const res = await fetch(`${apiBase()}/conversations${path}`, { method, headers: { "content-type": "application/json", "x-keyo-owner": o }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (!res.ok) throw new Error(`Serveur : ${res.status}`);
  return (await res.json()) as T;
}
const pushThread = (t: Thread) => (t.feed.length && !t.remote ? remote(`/${t.id}`, "PUT", t).then(() => undefined) : Promise.resolve());
let pushTimer: ReturnType<typeof setTimeout> | undefined;
let dirty = false;
function schedulePush() {
  dirty = true;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    if (state.busy) return schedulePush();
    dirty = false;
    pushThread(threadOf(state)).catch(() => (dirty = true));
  }, 2000);
}

const set = (patch: Partial<State>) => {
  const touched = "feed" in patch || "history" in patch;
  state = { ...state, ...patch, ...(touched ? { updatedAt: new Date().toISOString() } : {}) };
  persist();
  emit();
};

const titleOf = (t: string) => {
  const one = t.replace(/\s+/g, " ").trim();
  return one ? (one.length > 42 ? `${one.slice(0, 40).trim()}…` : one) : "Document envoyé";
};
const push = (...items: FeedItem[]) => {
  const first = state.feed.length === 0 ? items.find((i): i is Extract<FeedItem, { kind: "user" }> => i.kind === "user") : undefined;
  set({ feed: [...state.feed, ...items], ...(first ? { title: titleOf(first.text) } : {}) });
};

export const getAttachment = (aid: string) => state.attachments[aid];

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

/** Tour en cours : le propriétaire peut l'arrêter à tout moment. */
let current: AbortController | null = null;
class Stopped extends Error {}
const checkStopped = () => {
  if (current?.signal.aborted) throw new Stopped();
};

/** Un ou plusieurs tours avec Claude, jusqu'à une réponse finale ou une confirmation attendue. */
async function runClaude(steps = 0): Promise<void> {
  if (steps >= MAX_STEPS) {
    push({ id: id(), kind: "error", text: "L'agent a enchaîné trop d'étapes. Reformulez votre demande." });
    return;
  }
  const res = await postTurn(state.history, turnContext(), current?.signal);
  checkStopped();
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
  set({ pending: { order: uses.map((u) => u.id), results: {} } });
  for (const u of uses) {
    if (isAgentTool(u.name) && needsConfirmation(u.name, policy())) {
      push({ id: id(), kind: "proposal", toolUseId: u.id, name: u.name, input: u.input ?? {}, description: describeAction(u.name, u.input ?? {}), status: "pending" });
      continue;
    }
    const out = await executeTool(u.name, u.input);
    push({ id: id(), kind: "activity", label: out.ok ? `${labelOf(u.name)} : ${out.summary}` : `${labelOf(u.name)} : échec`, ok: out.ok });
    record(u.id, out.ok ? { content: JSON.stringify(out.result) } : { content: out.error, is_error: true });
    checkStopped();
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

/** Dernier message du propriétaire, avec sa position dans le fil. */
const lastUserIndex = () => {
  for (let i = state.feed.length - 1; i >= 0; i--) if (state.feed[i]!.kind === "user") return i;
  return -1;
};

/**
 * Après un arrêt, l'historique Claude doit rester valide : on revient juste avant le dernier
 * message du propriétaire (il reste affiché ; « Régénérer » le renverra).
 */
function rollbackTurn() {
  const i = lastUserIndex();
  const u = state.feed[i];
  const cut = u && u.kind === "user" && u.hist !== undefined ? u.hist : state.history.length;
  set({
    history: state.history.slice(0, cut),
    pending: null,
    feed: state.feed.map((f) => (f.kind === "proposal" && f.status === "pending" ? { ...f, status: "declined" as const, result: "Arrêté" } : f)),
  });
}

async function guard(task: () => Promise<void>) {
  current = new AbortController();
  set({ busy: true });
  try {
    await task();
  } catch (e) {
    if (e instanceof Stopped || current?.signal.aborted) {
      rollbackTurn();
      push({ id: id(), kind: "error", text: "Réponse arrêtée." });
    } else if (e instanceof AgentUnavailable) {
      set({ mode: "demo" });
      push({ id: id(), kind: "error", text: "L'agent IA n'est pas configuré sur le serveur : mode démo." });
    } else {
      push({ id: id(), kind: "error", text: e instanceof Error && e.message !== "Aborted" ? e.message : "Pas de réponse du serveur. Vérifiez la connexion et réessayez." });
    }
  } finally {
    current = null;
    set({ busy: false });
  }
}

/** Réponse à un message du propriétaire, déjà affiché dans le fil. */
async function answer(text: string, files: Attachment[], refs: AttachmentRef[]) {
  const mode = await ensureMode();
  if (mode === "claude") {
    const note = refs.length ? `\n\n[Pièces jointes : ${refs.map((r) => `${r.id} « ${r.name} » (${r.kind === "pdf" ? "PDF" : "photo"})`).join(", ")}]` : "";
    const content = files.length ? [...files.map(toContentBlock), { type: "text", text: text + note }] : text + note;
    set({ history: [...state.history, { role: "user", content }] });
    await runClaude();
    return;
  }
  const s = getSession();
  const auto = refs.length ? null : await demoAutonomyReply(text);
  checkStopped();
  const r = auto ?? (refs.length ? demoAttachmentReply(refs[0]!, text) : demoReply(text, s.status === "signedIn" ? s.user.displayCurrency : "XOF"));
  sayAgent(r.text, r.link);
  if (r.proposal) push({ id: id(), kind: "proposal", toolUseId: `demo-${id()}`, name: r.proposal.name, input: r.proposal.input, description: describeAction(r.proposal.name, r.proposal.input), status: "pending" });
}

export const conversation = {
  async hydrate() {
    const saved = await load<{ v?: number; active?: Thread; archive?: Thread[] } & Partial<Thread>>(KEYS.agent);
    if (saved?.v === 2 && saved.active) state = { ...state, ...saved.active, archive: saved.archive ?? [] };
    else if (saved?.feed?.length) {
      // Ancien format : une seule conversation.
      const first = saved.feed.find((f) => f.kind === "user");
      state = { ...state, ...blank(), feed: saved.feed, history: saved.history ?? [], pending: saved.pending ?? null, attachments: saved.attachments ?? {}, title: first && first.kind === "user" ? titleOf(first.text) : "Conversation" };
    }
    emit();
  },

  async send(raw: string, files: Attachment[] = []) {
    const text = raw.trim() || (files.length ? "Voici un document." : "");
    if (!text || state.busy || state.pending) return;
    Speech.stop();
    const refs: AttachmentRef[] = files.map(({ id: aid, name, uri, kind }) => ({ id: aid, name, uri, kind }));
    push({ id: id(), kind: "user", text: raw.trim(), attachments: refs.length ? refs : undefined, hist: state.history.length });
    set({ attachments: { ...state.attachments, ...Object.fromEntries(refs.map((r) => [r.id, r])) } });
    await guard(() => answer(text, files, refs));
  },

  /** Arrête la réponse en cours. */
  stop() {
    Speech.stop();
    current?.abort();
  },

  /** Refait la dernière réponse de l'agent (les photos et PDF ne sont pas renvoyés). */
  async regenerate() {
    if (state.busy || state.pending) return;
    const i = lastUserIndex();
    const u = state.feed[i];
    if (!u || u.kind !== "user") return;
    Speech.stop();
    set({ feed: state.feed.slice(0, i + 1), pending: null });
    await guard(async () => {
      const mode = await ensureMode();
      if (mode === "claude" && u.hist !== undefined && state.history.length > u.hist) {
        set({ history: state.history.slice(0, u.hist + 1) });
        await runClaude();
      } else await answer(u.text || "Voici un document.", [], u.attachments ?? []);
    });
  },

  /** Modifier un message : le fil reprend juste avant lui ; renvoie son texte pour la saisie. */
  editFrom(itemId: string): string | null {
    if (state.busy) return null;
    const i = state.feed.findIndex((f) => f.id === itemId);
    const u = state.feed[i];
    if (!u || u.kind !== "user") return null;
    Speech.stop();
    set({ feed: state.feed.slice(0, i), history: state.history.slice(0, u.hist ?? state.history.length), pending: null });
    return u.text;
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

  /** Nouvelle conversation ; l'actuelle rejoint l'historique si elle n'est pas vide. */
  newThread() {
    if (state.busy) return;
    Speech.stop();
    void pushThread(threadOf(state)).catch(() => undefined);
    const archive = state.feed.length ? [threadOf(state), ...state.archive].slice(0, MAX_THREADS) : state.archive;
    state = { ...state, ...blank(), archive };
    persist();
    emit();
  },

  async openThread(threadId: string) {
    if (state.busy || threadId === state.id) return;
    let t = state.archive.find((x) => x.id === threadId);
    if (!t) return;
    if (t.remote) {
      // Conversation venue d'un autre appareil : téléchargée à la première ouverture.
      try {
        t = { ...(await remote<Thread>(`/${threadId}`)), remote: false };
      } catch {
        return;
      }
    }
    Speech.stop();
    void pushThread(threadOf(state)).catch(() => undefined);
    const rest = state.archive.filter((x) => x.id !== threadId);
    state = { ...state, ...t, archive: state.feed.length ? [threadOf(state), ...rest].slice(0, MAX_THREADS) : rest };
    persist();
    emit();
  },

  deleteThread(threadId: string) {
    void remote(`/${threadId}`, "DELETE").catch(() => undefined);
    if (threadId === state.id) {
      if (state.busy) return;
      state = { ...state, ...blank() };
    } else state = { ...state, archive: state.archive.filter((x) => x.id !== threadId) };
    persist();
    emit();
  },

  /** Efface toutes les conversations (Profil > Agent Keyo, ou effacement des données). */
  async reset() {
    Speech.stop();
    current?.abort();
    for (const t of [threadOf(state), ...state.archive]) void remote(`/${t.id}`, "DELETE").catch(() => undefined);
    await remove(KEYS.agent);
    state = { ...state, ...blank(), archive: [], busy: false, mode: "unknown", offline: false };
    emit();
  },

  /**
   * Rapproche le téléphone et le serveur : envoie les conversations locales absentes du serveur,
   * ajoute à l'historique celles du serveur absentes du téléphone (téléchargées à l'ouverture).
   */
  async syncWithServer() {
    try {
      const list = await remote<{ id: string; title: string; updatedAt: string }[]>("");
      const local = [threadOf(state), ...state.archive].filter((t) => t.feed.length || t.remote);
      const known = new Set(local.map((t) => t.id));
      const onServer = new Set(list.map((x) => x.id));
      for (const t of local) if (!onServer.has(t.id) || (t.id === state.id && dirty)) await pushThread(t).catch(() => undefined);
      const stubs: Thread[] = list.filter((x) => !known.has(x.id)).map((x) => ({ id: x.id, title: x.title, updatedAt: x.updatedAt, feed: [], history: [], pending: null, attachments: {}, remote: true }));
      if (stubs.length) {
        state = { ...state, archive: [...state.archive, ...stubs].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, MAX_THREADS) };
        save(KEYS.agent, { v: 2, active: threadOf(state), archive: state.archive });
        emit();
      }
    } catch {
      // Serveur injoignable : nouvel essai à la prochaine synchronisation.
    }
  },

  /** Revérifie la disponibilité du serveur (après ajout de la clé, par exemple). */
  async refreshMode() {
    state = { ...state, mode: "unknown" };
    await ensureMode();
  },
};
