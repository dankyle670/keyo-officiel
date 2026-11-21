import type { AgentToolName } from "./agent.ts";

/**
 * Hiérarchie des actions de l'agent : chaque outil a un palier de modèle minimal.
 * - FAST (Haiku) : lire et présenter des données déjà calculées ;
 * - STANDARD (Sonnet) : agir (messages, devis, dépenses, réglages), chercher sur le web ;
 * - EXPERT (Opus) : contrats, fiscalité et conformité, valeur et expertise, patrimoine et banque.
 * L'agent commence chaque demande sur le palier le plus léger ; dès qu'il choisit une action d'un
 * palier supérieur, le serveur reprend l'étape avec le modèle de ce palier. L'agent peut aussi
 * monter de lui-même (outil switch_model) quand la question l'exige sans action particulière.
 */
export const MODEL_TIERS = ["FAST", "STANDARD", "EXPERT"] as const;
export type ModelTier = (typeof MODEL_TIERS)[number];
export const MODEL_TIER_LABEL: Record<ModelTier, string> = { FAST: "Rapide", STANDARD: "Courant", EXPERT: "Expert" };

export const TOOL_TIER: Record<AgentToolName, ModelTier> = {
  // Lire
  get_portfolio: "FAST",
  get_rents: "FAST",
  get_incidents: "FAST",
  get_documents: "FAST",
  get_craftsmen: "FAST",
  get_payment_accounts: "FAST",
  get_capabilities: "FAST",
  get_autonomous_activity: "FAST",
  get_monthly_report: "FAST",
  get_finances: "STANDARD",
  // Agir
  send_reminder: "STANDARD",
  send_message: "STANDARD",
  request_quotes: "STANDARD",
  approve_quote: "STANDARD",
  resolve_incident: "STANDARD",
  schedule_maintenance: "STANDARD",
  assign_mission: "STANDARD",
  add_craftsman: "STANDARD",
  add_expense: "STANDARD",
  file_document: "STANDARD",
  create_asset: "STANDARD",
  invite_occupant: "STANDARD",
  update_unit: "STANDARD",
  update_asset_sheet: "STANDARD",
  decide_pending_action: "STANDARD",
  undo_autonomous_action: "STANDARD",
  set_autonomy: "STANDARD",
  run_autonomous_pass: "STANDARD",
  invite_family_member: "STANDARD",
  // Engager, interpréter, évaluer
  update_lease: "EXPERT",
  run_compliance_check: "EXPERT",
  get_valuation: "EXPERT",
  get_appraisal_questions: "EXPERT",
  submit_appraisal: "EXPERT",
  set_asset_value: "EXPERT",
  get_owner_passport: "EXPERT",
  get_patrimony: "EXPERT",
  set_family_shares: "EXPERT",
};

/** Outils fournis par Claude lui-même (côté serveur) : la recherche web demande au moins STANDARD. */
export const SERVER_TOOL_TIER: Record<string, ModelTier> = { web_search: "STANDARD" };

const rank = (t: ModelTier) => MODEL_TIERS.indexOf(t);
export const maxTier = (...t: ModelTier[]): ModelTier => t.reduce((a, b) => (rank(b) > rank(a) ? b : a), "FAST" as ModelTier);
export const tierAtLeast = (t: ModelTier, min: ModelTier) => rank(t) >= rank(min);
export const tierOfTool = (name: string): ModelTier => (TOOL_TIER as Record<string, ModelTier>)[name] ?? SERVER_TOOL_TIER[name] ?? "STANDARD";
