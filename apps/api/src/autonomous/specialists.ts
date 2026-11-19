import { z } from "zod";
import { actionDef, AUTONOMOUS_ACTION_KEYS, SPECIALIST_LABEL, type AutonomousAction, type Specialist } from "@keyo/shared";
import { ACTION_INPUTS } from "./actions.ts";
import type { OwnerSnapshot } from "./store.ts";
import { complianceFindings, craftsmen, endingAgreements, monthSummary, openIncidents, overdueRents, recentlyPaid, vacantUnits } from "./views.ts";

/**
 * Agents spécialisés. Chacun ne voit que ses lectures et ses actions : un agent d'encaissement ne
 * peut pas demander de devis, un agent d'entretien ne peut pas relancer un loyer.
 */
type Read = { description: string; run: (s: OwnerSnapshot, today: string) => unknown };

const READS: Record<string, Read> = {
  get_overdue_rents: { description: "Échéances en retard, partielles ou impayées, avec l'occupant, le reste dû et le nombre de jours de retard.", run: (s, t) => overdueRents(s, t) },
  get_recent_payments: { description: "Échéances payées (confirmées par l'opérateur) des 31 derniers jours.", run: (s, t) => recentlyPaid(s, t) },
  get_vacant_units: { description: "Logements ou unités sans contrat en cours.", run: (s, t) => vacantUnits(s, t) },
  get_ending_agreements: { description: "Contrats qui se terminent dans les 60 jours.", run: (s, t) => endingAgreements(s, t) },
  get_open_incidents: { description: "Incidents et pannes non résolus, avec leurs devis.", run: (s) => openIncidents(s) },
  get_craftsmen: { description: "Artisans enregistrés par le propriétaire.", run: (s) => craftsmen(s) },
  get_compliance_findings: { description: "Points du contrôle de gestion (pièces manquantes, fiscalité, échéances), classés par gravité.", run: (s, t) => complianceFindings(s, t) },
  get_month_summary: { description: "Encaissé, attendu, retards, dépenses et incidents du mois en cours.", run: (s, t) => monthSummary(s, t.slice(0, 7)) },
  get_parties: {
    description: "Personnes liées aux biens (occupants, gestionnaires, artisans) avec leur identifiant.",
    run: (s) => s.parties.filter((p) => p.role !== "FAMILY").map((p) => ({ partyId: p.id, role: p.role, name: `${p.firstName} ${p.lastName}` })),
  },
};

export type SpecialistDef = { id: Specialist; mission: string; reads: (keyof typeof READS)[] };

export const SPECIALISTS: Record<Specialist, SpecialistDef> = {
  COLLECTION: {
    id: "COLLECTION",
    mission:
      "Vous gérez l'encaissement des loyers. Relancez les retards avec tact (première relance courtoise, puis lien de paiement, puis échéancier ou mise en demeure à soumettre au propriétaire). Envoyez les quittances des paiements confirmés. Ne relancez jamais une échéance payée.",
    reads: ["get_overdue_rents", "get_recent_payments"],
  },
  RELETTING: {
    id: "RELETTING",
    mission: "Vous gérez la relocation des logements vacants : annonce, réponses aux candidats, visites. Le choix du locataire et la signature du bail restent au propriétaire.",
    reads: ["get_vacant_units", "get_ending_agreements"],
  },
  MAINTENANCE: {
    id: "MAINTENANCE",
    mission: "Vous gérez l'entretien : qualifiez chaque incident non qualifié, demandez des devis aux artisans enregistrés, acceptez un devis dans la limite du plafond, planifiez l'intervention avec l'occupant.",
    reads: ["get_open_incidents", "get_craftsmen"],
  },
  COMPLIANCE: {
    id: "COMPLIANCE",
    mission: "Vous veillez à la conformité : réclamez les pièces manquantes aux bonnes personnes et rappelez au propriétaire les échéances (fins de contrat, fiscalité, assurances). Ne traitez que les points réellement relevés par le contrôle.",
    reads: ["get_compliance_findings", "get_ending_agreements", "get_parties"],
  },
  FINANCE: {
    id: "FINANCE",
    mission: "Vous tenez le propriétaire informé de ses finances : rapport du mois, suggestion d'une nouvelle expertise quand une valeur semble dépassée.",
    reads: ["get_month_summary"],
  },
};

export const actionsOf = (sp: Specialist) => AUTONOMOUS_ACTION_KEYS.filter((k) => actionDef(k).specialist === sp);

const schemaOf = (input: z.ZodObject) => {
  const { $schema: _ignored, ...schema } = z.toJSONSchema(input) as Record<string, unknown>;
  return { ...schema, type: "object" as const };
};

/** Outils Claude d'un spécialiste : ses lectures, puis ses actions (qui passent toutes par le contrôle d'autonomie). */
export function specialistTools(sp: Specialist) {
  const reads = SPECIALISTS[sp].reads.map((name) => ({ name, description: READS[name]!.description, input_schema: { type: "object" as const, properties: {} } }));
  const acts = actionsOf(sp).map((name) => ({
    name,
    description: `${actionDef(name).label}. ${actionDef(name).description} Passe par le contrôle d'autonomie du propriétaire : l'action peut être exécutée, mise en attente de son accord, différée ou refusée.`,
    input_schema: schemaOf(ACTION_INPUTS[name]),
  }));
  return [...reads, ...acts];
}

export const runRead = (name: string, s: OwnerSnapshot, today: string) => READS[name]?.run(s, today);
export const isRead = (name: string) => name in READS;
export const isActionOf = (sp: Specialist, name: string): name is AutonomousAction => actionsOf(sp).includes(name as AutonomousAction);

export const SPECIALIST_SYSTEM = (sp: Specialist) => `Vous êtes l'agent « ${SPECIALIST_LABEL[sp]} » de Keyo, qui gère des biens à distance pour des propriétaires (souvent de la diaspora) à la place d'une agence.
${SPECIALISTS[sp].mission}

Règles :
- Consultez d'abord les données avec vos outils de lecture ; n'agissez que sur des identifiants qu'ils vous ont donnés.
- Chaque action passe par le contrôle d'autonomie : lisez le statut renvoyé (DONE, PENDING_APPROVAL, DEFERRED, BLOCKED, DUPLICATE, INVALID) et n'insistez pas en cas de refus.
- Vous ne déplacez jamais d'argent, ne signez rien, ne résiliez aucun contrat, n'engagez aucune procédure.
- Messages aux tiers : français, vouvoiement, courts, courtois, sans emoji, signés « Keyo, pour le compte de votre propriétaire ».
- Terminez par un compte rendu de deux à quatre phrases : ce qui a été fait, ce qui attend l'accord du propriétaire.`;
