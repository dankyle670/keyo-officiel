import type { AgentToolName } from "./agent.ts";
import { actionDef, levelOf, type AutonomousAction, type AutonomyLevel, type AutonomyPolicy, type Channel } from "./autonomy.ts";

/**
 * Catalogue complet de ce que l'agent Keyo sait faire, regroupé par domaine. Source unique pour
 * répondre à « que sais-tu faire ? » : l'agent doit tout présenter, y compris ce qui attend un
 * connecteur (canal simulé). Le statut de chaque action est calculé ici, pas par le modèle.
 */
type Entry = { what: string; tool: AgentToolName; channels?: Channel[] } | { what: string; auto: AutonomousAction };

export const CAPABILITY_GROUPS: { domain: string; entries: Entry[] }[] = [
  {
    domain: "Loyers et encaissement",
    entries: [
      { what: "Suivre les échéances du mois (payé, en retard, partiel)", tool: "get_rents" },
      { what: "Vous dire où arrivent vos loyers et quel bien n'a pas de compte de réception", tool: "get_payment_accounts" },
      { what: "Relancer un locataire en retard (courtoise, ferme, dernier rappel)", tool: "send_reminder", channels: ["WHATSAPP", "SMS"] },
      { what: "Relancer seul les retards", auto: "send_rent_reminder" },
      { what: "Envoyer un lien de paiement", auto: "send_payment_link" },
      { what: "Envoyer les quittances des loyers payés", auto: "send_receipt" },
      { what: "Proposer un échéancier à un locataire en difficulté", auto: "propose_payment_plan" },
      { what: "Préparer une mise en demeure", auto: "send_formal_notice" },
    ],
  },
  {
    domain: "Biens, logements et contrats",
    entries: [
      { what: "Présenter vos biens, logements, occupants et taux d'occupation", tool: "get_portfolio" },
      { what: "Créer un bien et ses logements", tool: "create_asset" },
      { what: "Louer un logement libre et inviter l'occupant", tool: "invite_occupant", channels: ["SMS"] },
      { what: "Modifier un contrat (loyer, caution, échéance, date de fin)", tool: "update_lease" },
      { what: "Modifier un logement (nom, loyer demandé, surface)", tool: "update_unit" },
      { what: "Écrire à un occupant, un gérant ou un artisan", tool: "send_message", channels: ["WHATSAPP", "SMS"] },
    ],
  },
  {
    domain: "Relocation",
    entries: [
      { what: "Publier l'annonce d'un logement vacant", auto: "publish_listing" },
      { what: "Répondre aux candidats et demander leur dossier", auto: "reply_to_candidate" },
      { what: "Organiser les visites", auto: "schedule_visit" },
    ],
  },
  {
    domain: "Incidents et entretien",
    entries: [
      { what: "Suivre les incidents et leurs devis", tool: "get_incidents" },
      { what: "Consulter votre carnet d'artisans", tool: "get_craftsmen" },
      { what: "Trouver des artisans près de vos biens sur Internet et les ajouter au carnet", tool: "add_craftsman" },
      { what: "Qualifier un incident signalé (urgence, catégorie)", auto: "triage_incident" },
      { what: "Demander des devis aux artisans", tool: "request_quotes", channels: ["WHATSAPP", "SMS"] },
      { what: "Accepter un devis (dans la limite de votre plafond quand j'agis seul)", tool: "approve_quote" },
      { what: "Planifier l'intervention avec l'occupant", auto: "schedule_intervention" },
      { what: "Clôturer un incident résolu", tool: "resolve_incident" },
      { what: "Programmer l'entretien régulier (climatisation, fosse, toiture)", tool: "schedule_maintenance" },
      { what: "Confier une mission à un gérant sur place (visite, état des lieux, clés)", tool: "assign_mission", channels: ["SMS"] },
    ],
  },
  {
    domain: "Documents, conformité et fiscalité",
    entries: [
      { what: "Lire et classer un document envoyé en photo ou PDF (bail, assurance, déclaration)", tool: "file_document" },
      { what: "Consulter les documents d'un bien", tool: "get_documents" },
      { what: "Contrôler la gestion : pièces manquantes, fiscalité, retards, contrats", tool: "run_compliance_check" },
      { what: "Réclamer une pièce manquante à la bonne personne", auto: "request_missing_document" },
      { what: "Vous rappeler les échéances (fin de contrat, impôts, assurance)", auto: "remind_deadline" },
    ],
  },
  {
    domain: "Finances et valeur",
    entries: [
      { what: "Enregistrer une dépense ou une facture", tool: "add_expense" },
      { what: "Calculer revenus, dépenses et rentabilité", tool: "get_finances" },
      { what: "Préparer le rapport du mois", tool: "get_monthly_report" },
      { what: "Vous envoyer le rapport du mois", auto: "send_monthly_report" },
      { what: "Estimer la valeur d'un bien (maisons, appartements, immeubles, plantations)", tool: "get_appraisal_questions" },
      { what: "Mener l'expertise et enregistrer la valeur", tool: "submit_appraisal" },
      { what: "Fixer la valeur d'un bien", tool: "set_asset_value" },
      { what: "Vous proposer une nouvelle expertise", auto: "suggest_reappraisal" },
    ],
  },
  {
    domain: "Famille et banque",
    entries: [
      { what: "Calculer votre patrimoine et la part de chacun", tool: "get_patrimony" },
      { what: "Inviter un proche (consultation ou co-gestion)", tool: "invite_family_member", channels: ["SMS"] },
      { what: "Répartir les parts d'un bien de famille", tool: "set_family_shares" },
      { what: "Préparer votre passeport propriétaire et votre capacité d'emprunt", tool: "get_owner_passport" },
    ],
  },
  {
    domain: "Mon autonomie",
    entries: [
      { what: "Vous dire ce que j'ai fait en votre absence et ce qui attend votre accord", tool: "get_autonomous_activity" },
      { what: "Valider ou refuser une demande en attente", tool: "decide_pending_action" },
      { what: "Annuler une de mes actions", tool: "undo_autonomous_action" },
      { what: "Changer ce que je fais seul, mon plafond de dépense, me mettre en pause", tool: "set_autonomy" },
      { what: "Faire un passage tout de suite", tool: "run_autonomous_pass" },
    ],
  },
];

/** Ce qui reste interdit, quel que soit le réglage. */
export const NEVER_DOES = ["ajouter, modifier ou supprimer vos comptes de paiement", "déplacer de l'argent", "signer à votre place", "résilier un contrat", "engager une procédure judiciaire"];

export type CapabilityStatus = "READY" | "READY_SIMULATED" | "ASKS_YOU" | "OFF";
export type Capability = { what: string; mode: "Sur demande" | "Seul"; status: CapabilityStatus; note?: string };

const LEVEL_NOTE: Record<AutonomyLevel, string> = { OFF: "désactivé dans vos réglages", ASK: "je vous demande avant", NOTIFY: "je le fais et je vous préviens", AUTO: "je le fais seul" };

/**
 * Statut de chaque action selon les connecteurs réellement branchés et les réglages d'autonomie.
 * `connected` : canaux dont le pilote réel est actif (les autres sont simulés). Sans information
 * (serveur injoignable), on considère tous les canaux de message comme simulés.
 */
export function capabilities(connected: Channel[], policy?: AutonomyPolicy) {
  const live = new Set<Channel>([...connected, "APP"]);
  const simulated = (channels?: Channel[]) => Boolean(channels?.length) && !channels!.some((c) => live.has(c));
  return CAPABILITY_GROUPS.map((g) => ({
    domain: g.domain,
    actions: g.entries.map((e): Capability => {
      if ("tool" in e) {
        const sim = simulated(e.channels);
        return { what: e.what, mode: "Sur demande", status: sim ? "READY_SIMULATED" : "READY", note: sim ? `message préparé et consigné, envoi réel quand ${e.channels!.join(" ou ")} sera connecté` : undefined };
      }
      const def = actionDef(e.auto);
      const level = policy ? levelOf(policy, e.auto) : def.defaultLevel;
      const out = def.channels.filter((c) => c !== "APP");
      const sim = out.length > 0 && !out.some((c) => live.has(c));
      const status: CapabilityStatus = level === "OFF" || policy?.enabled === false ? "OFF" : sim ? "READY_SIMULATED" : level === "ASK" ? "ASKS_YOU" : "READY";
      const notes = [policy?.enabled === false ? "agent en pause" : LEVEL_NOTE[level], sim ? `en attente du connecteur ${out.join(" ou ")}` : undefined].filter(Boolean);
      return { what: e.what, mode: "Seul", status, note: notes.join(", ") };
    }),
  }));
}
