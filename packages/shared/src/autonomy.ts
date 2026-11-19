import { z } from "zod";
import { Currency, Money } from "./money.ts";

/**
 * Agent autonome : ce que Keyo peut faire à la place du propriétaire, et à quelles conditions.
 * La décision est prise par le code (decideAutonomy), jamais par le modèle : même si un agent
 * « veut » agir, il ne le peut pas au-delà du réglage du propriétaire.
 *
 * Règles fixes, hors catalogue et donc impossibles : déplacer de l'argent, signer à la place du
 * propriétaire, résilier un contrat, engager une procédure judiciaire.
 */

/** OFF : jamais. ASK : préparer et demander l'accord. NOTIFY : faire puis prévenir. AUTO : faire seul (visible au journal). */
export const AutonomyLevel = z.enum(["OFF", "ASK", "NOTIFY", "AUTO"]);
export type AutonomyLevel = z.infer<typeof AutonomyLevel>;
const RANK: Record<AutonomyLevel, number> = { OFF: 0, ASK: 1, NOTIFY: 2, AUTO: 3 };

export const AUTONOMY_LEVEL_LABEL: Record<AutonomyLevel, string> = {
  OFF: "Jamais",
  ASK: "Me demander",
  NOTIFY: "Faire et me prévenir",
  AUTO: "Faire seul",
};

export type Specialist = "COLLECTION" | "RELETTING" | "MAINTENANCE" | "COMPLIANCE" | "FINANCE";
export const SPECIALIST_LABEL: Record<Specialist, string> = {
  COLLECTION: "Encaissement",
  RELETTING: "Relocation",
  MAINTENANCE: "Entretien",
  COMPLIANCE: "Conformité",
  FINANCE: "Finances",
};

/** Canal nécessaire pour exécuter l'action (connecteur du propriétaire ou de Keyo). */
export type Channel = "WHATSAPP" | "SMS" | "EMAIL" | "CALENDAR" | "LISTINGS" | "PAYMENT_LINK" | "APP";

type ActionDef = {
  specialist: Specialist;
  label: string;
  /** Ce que l'action fait concrètement, pour l'agent et pour l'écran des réglages. */
  description: string;
  defaultLevel: AutonomyLevel;
  /** Plafond absolu : certaines actions demandent toujours l'accord. */
  maxLevel: AutonomyLevel;
  /** L'action engage une dépense : soumise au plafond d'argent. */
  spends?: boolean;
  /** L'action écrit à un tiers (occupant, artisan, candidat). */
  outbound?: boolean;
  channels: Channel[];
  /** L'action peut être annulée depuis le journal (tant qu'elle n'a pas produit d'effet externe). */
  undoable?: boolean;
};

export const AUTONOMOUS_ACTIONS = {
  // Encaissement
  send_rent_reminder: {
    specialist: "COLLECTION",
    label: "Relancer un loyer en retard",
    description: "Message courtois à l'occupant, avec le montant dû et la date d'échéance. Pas plus d'une relance tous les 3 jours par échéance.",
    defaultLevel: "NOTIFY",
    maxLevel: "AUTO",
    outbound: true,
    channels: ["WHATSAPP", "SMS"],
  },
  send_payment_link: {
    specialist: "COLLECTION",
    label: "Envoyer un lien de paiement",
    description: "Lien de l'agrégateur de paiement pour une échéance. Les fonds vont directement au propriétaire.",
    defaultLevel: "NOTIFY",
    maxLevel: "AUTO",
    outbound: true,
    channels: ["PAYMENT_LINK", "WHATSAPP", "SMS"],
  },
  send_receipt: {
    specialist: "COLLECTION",
    label: "Envoyer la quittance",
    description: "Quittance d'une échéance payée et confirmée par l'opérateur de paiement.",
    defaultLevel: "AUTO",
    maxLevel: "AUTO",
    outbound: true,
    channels: ["WHATSAPP", "EMAIL"],
  },
  propose_payment_plan: {
    specialist: "COLLECTION",
    label: "Proposer un échéancier",
    description: "Étalement d'un retard en plusieurs versements. Engage le propriétaire : toujours soumis à son accord.",
    defaultLevel: "ASK",
    maxLevel: "ASK",
    outbound: true,
    channels: ["WHATSAPP", "SMS"],
  },
  send_formal_notice: {
    specialist: "COLLECTION",
    label: "Préparer une mise en demeure",
    description: "Courrier formel après plusieurs relances sans effet. Toujours soumis à l'accord du propriétaire.",
    defaultLevel: "ASK",
    maxLevel: "ASK",
    outbound: true,
    channels: ["EMAIL", "WHATSAPP"],
  },
  // Relocation
  publish_listing: {
    specialist: "RELETTING",
    label: "Publier une annonce",
    description: "Annonce d'un logement vacant, avec photos et loyer demandé.",
    defaultLevel: "ASK",
    maxLevel: "NOTIFY",
    outbound: true,
    channels: ["LISTINGS"],
  },
  reply_to_candidate: {
    specialist: "RELETTING",
    label: "Répondre aux candidats",
    description: "Réponses aux questions des candidats et demande des pièces du dossier.",
    defaultLevel: "NOTIFY",
    maxLevel: "AUTO",
    outbound: true,
    channels: ["WHATSAPP", "SMS", "EMAIL"],
  },
  schedule_visit: {
    specialist: "RELETTING",
    label: "Organiser une visite",
    description: "Créneau de visite avec le candidat et le gestionnaire sur place.",
    defaultLevel: "NOTIFY",
    maxLevel: "AUTO",
    outbound: true,
    channels: ["CALENDAR", "WHATSAPP"],
    undoable: true,
  },
  // Entretien
  triage_incident: {
    specialist: "MAINTENANCE",
    label: "Qualifier un incident",
    description: "Catégorie, urgence et premières consignes à l'occupant.",
    defaultLevel: "AUTO",
    maxLevel: "AUTO",
    channels: ["APP"],
    undoable: true,
  },
  request_quotes: {
    specialist: "MAINTENANCE",
    label: "Demander des devis",
    description: "Demande de devis à des artisans pour un incident.",
    defaultLevel: "NOTIFY",
    maxLevel: "AUTO",
    outbound: true,
    channels: ["WHATSAPP", "SMS"],
  },
  approve_quote: {
    specialist: "MAINTENANCE",
    label: "Accepter un devis",
    description: "Accord donné à l'artisan, dans la limite du plafond de dépense. Le paiement reste fait par le propriétaire.",
    defaultLevel: "ASK",
    maxLevel: "AUTO",
    spends: true,
    outbound: true,
    channels: ["WHATSAPP", "SMS"],
  },
  schedule_intervention: {
    specialist: "MAINTENANCE",
    label: "Planifier une intervention",
    description: "Créneau commun entre l'artisan et l'occupant.",
    defaultLevel: "NOTIFY",
    maxLevel: "AUTO",
    outbound: true,
    channels: ["CALENDAR", "WHATSAPP"],
    undoable: true,
  },
  // Conformité
  request_missing_document: {
    specialist: "COMPLIANCE",
    label: "Réclamer une pièce manquante",
    description: "Demande d'un document manquant (assurance, état des lieux, pièce d'identité) à la personne concernée.",
    defaultLevel: "NOTIFY",
    maxLevel: "AUTO",
    outbound: true,
    channels: ["WHATSAPP", "EMAIL"],
  },
  remind_deadline: {
    specialist: "COMPLIANCE",
    label: "Rappeler une échéance",
    description: "Rappel au propriétaire : fin de contrat, déclaration fiscale, assurance à renouveler.",
    defaultLevel: "AUTO",
    maxLevel: "AUTO",
    channels: ["APP"],
  },
  // Finances
  send_monthly_report: {
    specialist: "FINANCE",
    label: "Envoyer le rapport du mois",
    description: "Rapport mensuel au propriétaire (et aux membres de la famille qui y ont accès).",
    defaultLevel: "AUTO",
    maxLevel: "AUTO",
    channels: ["APP", "EMAIL"],
  },
  suggest_reappraisal: {
    specialist: "FINANCE",
    label: "Proposer une nouvelle expertise",
    description: "Suggestion de refaire l'expertise d'un bien dont la valeur a pu changer.",
    defaultLevel: "AUTO",
    maxLevel: "AUTO",
    channels: ["APP"],
  },
} satisfies Record<string, ActionDef>;

export type AutonomousAction = keyof typeof AUTONOMOUS_ACTIONS;
export const AUTONOMOUS_ACTION_KEYS = Object.keys(AUTONOMOUS_ACTIONS) as AutonomousAction[];
export const isAutonomousAction = (k: string): k is AutonomousAction => k in AUTONOMOUS_ACTIONS;
export const actionDef = (k: AutonomousAction): ActionDef => AUTONOMOUS_ACTIONS[k];

export const AutonomyPolicy = z.object({
  /** Interrupteur général : faux = l'agent ne fait plus rien de lui-même. */
  enabled: z.boolean(),
  /** Dépense maximale qu'une action peut engager sans accord, par devise. */
  spendCaps: z.array(Money),
  levels: z.record(z.string(), AutonomyLevel),
  /** Pas de message aux tiers en dehors de ces heures (heure locale du bien). */
  quietHours: z.object({ from: z.number().int().min(0).max(23), to: z.number().int().min(0).max(23) }).optional(),
});
export type AutonomyPolicy = z.infer<typeof AutonomyPolicy>;

export function defaultPolicy(currency: Currency): AutonomyPolicy {
  return {
    enabled: true,
    spendCaps: [{ amount: currency === "XOF" ? 50_000 : 10_000, currency }],
    levels: {},
    quietHours: { from: 20, to: 8 },
  };
}

export const levelOf = (policy: AutonomyPolicy, action: AutonomousAction): AutonomyLevel => {
  const def = actionDef(action);
  const wanted = AutonomyLevel.safeParse(policy.levels[action]).data ?? def.defaultLevel;
  return RANK[wanted] > RANK[def.maxLevel] ? def.maxLevel : wanted;
};

export type AutonomyDecision =
  | { kind: "EXECUTE"; notify: boolean; reason: string }
  | { kind: "ASK"; reason: string }
  | { kind: "DEFER"; until: string; reason: string }
  | { kind: "BLOCKED"; reason: string };

export type AutonomyRequest = {
  action: string;
  /** Dépense engagée par l'action, s'il y en a une. */
  spend?: Money;
  /** Heure locale du bien (0 à 23), pour les heures calmes. */
  localHour?: number;
  /** Le propriétaire a donné son accord pour cette action précise (demande approuvée). */
  approved?: boolean;
};

const inQuiet = (h: number, q: { from: number; to: number }) => (q.from > q.to ? h >= q.from || h < q.to : h >= q.from && h < q.to);

/** Décision déterministe : exécuter, demander l'accord, différer ou refuser. */
export function decideAutonomy(policy: AutonomyPolicy, req: AutonomyRequest): AutonomyDecision {
  if (!isAutonomousAction(req.action)) return { kind: "BLOCKED", reason: "Action hors du catalogue : l'agent n'y a pas accès." };
  const def = actionDef(req.action);
  if (!policy.enabled && !req.approved) return { kind: "BLOCKED", reason: "Agent en pause : aucune action autonome." };
  const level = levelOf(policy, req.action);
  if (level === "OFF") return { kind: "BLOCKED", reason: `« ${def.label} » est désactivé dans vos réglages.` };

  if (def.outbound && policy.quietHours && req.localHour !== undefined && inQuiet(req.localHour, policy.quietHours)) {
    return { kind: "DEFER", until: `${String(policy.quietHours.to).padStart(2, "0")}:00`, reason: "Heures calmes : le message partira demain matin." };
  }
  if (req.approved) return { kind: "EXECUTE", notify: false, reason: "Accord du propriétaire." };
  if (level === "ASK") return { kind: "ASK", reason: `Vous avez choisi d'être consulté pour « ${def.label} ».` };

  if (def.spends) {
    if (!req.spend) return { kind: "ASK", reason: "Montant de la dépense inconnu : accord nécessaire." };
    const cap = policy.spendCaps.find((c) => c.currency === req.spend!.currency);
    if (!cap) return { kind: "ASK", reason: `Aucun plafond en ${req.spend.currency} : accord nécessaire.` };
    if (req.spend.amount > cap.amount) return { kind: "ASK", reason: "Dépense au-delà de votre plafond : accord nécessaire." };
  }
  return { kind: "EXECUTE", notify: level === "NOTIFY", reason: level === "AUTO" ? "Autorisé à agir seul." : "Autorisé, avec notification." };
}
