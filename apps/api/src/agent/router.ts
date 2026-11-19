import type Anthropic from "@anthropic-ai/sdk";

/**
 * Choix du modèle pour chaque tâche, décidé par le code (sans appel à Claude) :
 * - « rapide » (Haiku) : salutations, consultations simples, tâches de fond très encadrées ;
 * - « courant » (Sonnet) : la plupart des demandes, actions, recherche d'artisans ;
 * - « expert » (Opus) : fiscalité, droit, expertise de valeur, patrimoine, documents PDF, analyses longues.
 * Haiku et Sonnet peuvent en plus consulter Opus d'eux-mêmes (outil « advisor ») quand une
 * question les dépasse : c'est l'agent qui décide alors de monter en gamme, seulement pour ce passage.
 * Chaque palier se règle par variable d'environnement.
 */
export type Tier = "fast" | "standard" | "expert";
type Effort = "low" | "medium" | "high";

export type Route = { tier: Tier; model: string; effort: Effort; advisor?: string; reason: string };

const env = (k: string, d: string) => process.env[k] || d;
export const MODELS: Record<Tier, { model: string; effort: Effort }> = {
  fast: { model: env("KEYO_MODEL_FAST", "claude-haiku-5-5"), effort: "low" },
  standard: { model: env("KEYO_MODEL_STANDARD", "claude-sonnet-5-5"), effort: "medium" },
  expert: { model: env("KEYO_MODEL_EXPERT", "claude-opus-5-5"), effort: "medium" },
};
/** Conseiller consulté par Haiku ou Sonnet quand ils le jugent utile. Vide pour désactiver. */
const ADVISOR = env("KEYO_MODEL_ADVISOR", "claude-opus-5-5");

const route = (tier: Tier, reason: string): Route => {
  const m = MODELS[tier];
  return { tier, ...m, advisor: tier !== "expert" && ADVISOR && ADVISOR !== m.model ? ADVISOR : undefined, reason };
};

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const EXPERT =
  /(expertis|estim|valeur|evalu|fiscal|impot|taxe|juridi|\bloi\b|legal|litige|procedure|tribunal|avocat|expuls|mise en demeure|succession|herit|patrimoine|passeport|emprunt|credit|banque|\bpret\b|rentabilit|strateg|investi|compar|audit|controle complet|analyse|conseil|que me conseill|dois-je|faut-il)/;
const FAST_GREETING = /^(bonjour|bonsoir|salut|hello|coucou|merci|qui es[- ]tu|qui etes[- ]vous|tu es qui)\b/;
const FAST_LOOKUP = /^(ou en (sont|est)|quel(le)?s? (sont|est)|combien|liste|montre|affiche|qui (est|sont) en retard|qui a paye)\b/;
const CONFIRM = /^(oui|non|ok|okay|d'accord|daccord|vas[- ]y|go|valide|je valide|confirme|parfait|c'est bon|stop|annule|le premier|le deuxieme|la premiere)\b/;

type Msg = { role: "user" | "assistant"; content: string | Record<string, unknown>[] };

/** Texte écrit par le propriétaire dans un message (les résultats d'outils n'en sont pas). */
function ownerText(m: Msg): { text: string; pdf: boolean; image: boolean } | undefined {
  if (m.role !== "user") return undefined;
  if (typeof m.content === "string") return { text: m.content, pdf: false, image: false };
  const text = m.content.filter((b) => b.type === "text").map((b) => String(b.text ?? "")).join(" ");
  const pdf = m.content.some((b) => b.type === "document");
  const image = m.content.some((b) => b.type === "image");
  return text || pdf || image ? { text, pdf, image } : undefined;
}

function classify(o: { text: string; pdf: boolean; image: boolean }): Route | "inherit" {
  const t = norm(o.text.trim());
  if (o.pdf) return route("expert", "document PDF à lire");
  if (t.length > 400) return route("expert", "demande longue");
  if (EXPERT.test(t)) return route("expert", "question fiscale, juridique, de valeur ou d'analyse");
  if (o.image) return route("standard", "photo à lire");
  if (t.length <= 40 && CONFIRM.test(t)) return "inherit";
  if (t.length <= 60 && FAST_GREETING.test(t)) return route("fast", "salutation");
  if (t.length <= 80 && FAST_LOOKUP.test(t)) return route("fast", "consultation simple");
  return route("standard", "demande courante");
}

/**
 * Modèle d'un tour de chat. On regarde le dernier message écrit par le propriétaire : le choix reste
 * donc le même pendant toute la boucle d'outils de ce message. Une simple confirmation (« oui »,
 * « valide ») garde le modèle de la demande précédente, qui a préparé l'action.
 */
export function routeTurn(messages: Msg[]): Route {
  let inherited = false;
  for (let i = messages.length - 1; i >= 0; i--) {
    const o = ownerText(messages[i]!);
    if (!o) continue;
    const r = classify(o);
    if (r !== "inherit") return inherited ? { ...r, reason: `confirmation de : ${r.reason}` } : r;
    inherited = true;
  }
  return route("standard", inherited ? "confirmation" : "par défaut");
}

/** Tâches internes, choisies une fois pour toutes. */
export const ROUTES = {
  /** Priorisation des points du contrôle de gestion (sortie structurée, points déjà calculés). */
  ops: () => route("fast", "priorisation du contrôle"),
  /** Gérant de l'agent autonome : répartit le travail entre spécialistes. */
  manager: () => route("standard", "gérant"),
  /** Spécialistes de l'agent autonome : tâches encadrées, chaque action revalidée par ActionGate. */
  specialist: () => route("fast", "spécialiste"),
};

export const ADVISOR_BETA = "advisor-tool-2026-03-01";

/** Paramètres communs d'un appel selon le palier : modèle, effort, conseiller, bascule serveur. */
export function callParams(r: Route) {
  // Haiku n'a pas de bascule côté serveur ; l'en-tête du conseiller est toujours envoyé, car
  // l'historique peut contenir ses réponses même quand le palier courant ne l'utilise pas.
  const betas = [ADVISOR_BETA, ...(r.tier === "fast" ? [] : ["server-side-fallback-2026-07-01"])] as Anthropic.Beta.AnthropicBeta[];
  return {
    betas,
    ...(r.tier === "fast" ? {} : { fallbacks: "default" as const }),
    model: r.model,
    output_config: { effort: r.effort },
  };
}

/** Outil « advisor » : Haiku ou Sonnet consultent Opus quand ils le jugent nécessaire. */
export function advisorTool(r: Route, maxUses = 2) {
  return r.advisor ? [{ type: "advisor_20260301", name: "advisor", model: r.advisor, max_uses: maxUses } as unknown as Anthropic.Beta.BetaToolUnion] : [];
}
