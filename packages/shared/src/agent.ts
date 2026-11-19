import { z } from "zod";
import { Currency } from "./money.ts";
import { AssetType, DocumentKind, MissionKind, Urgency } from "./domain.ts";
import { ASSET_PROFILES } from "./modules/catalog.ts";
import { AUTONOMOUS_ACTION_KEYS, AutonomyLevel } from "./autonomy.ts";

/**
 * Outils de l'agent Keyo. Le serveur (apps/api) les décrit à Claude ; l'app les exécute sur les
 * données du téléphone, après validation de l'entrée avec ces mêmes schémas.
 * - `read` : consultation, exécutée sans demander.
 * - `write` : modifie les données ; `risk: "high"` touche l'argent, les occupants ou envoie un message.
 */
const date = z.iso.date().describe("Date au format AAAA-MM-JJ");
const month = z.string().regex(/^\d{4}-\d{2}$/).describe("Mois au format AAAA-MM");
const minor = z
  .number()
  .int()
  .nonnegative()
  .describe("Montant en entier, en unité mineure de la devise : FCFA (XOF) sans décimales, centimes pour EUR, CAD et USD (45,50 EUR = 4550)");

type ToolDef = { description: string; kind: "read" | "write"; risk?: "low" | "high"; input: z.ZodObject; label: string };

export const AGENT_TOOLS = {
  get_portfolio: {
    kind: "read",
    label: "Consultation des biens",
    description: "Liste les biens du propriétaire avec leurs logements, occupants, loyers et taux d'occupation. À appeler avant d'agir sur un bien pour connaître ses identifiants.",
    input: z.object({}),
  },
  get_rents: {
    kind: "read",
    label: "Consultation des loyers",
    description: "Échéances d'un mois avec leur statut (payé, à venir, en retard, partiel, impayé), le montant attendu et reçu.",
    input: z.object({ month: month.optional() }),
  },
  get_finances: {
    kind: "read",
    label: "Calcul des finances",
    description: "Revenus, dépenses, résultat net et rentabilité sur une année, pour un bien ou pour tout le patrimoine, avec la série mensuelle.",
    input: z.object({ assetId: z.string().optional(), year: z.number().int().optional() }),
  },
  get_monthly_report: {
    kind: "read",
    label: "Préparation du rapport",
    description: "Données du rapport mensuel : encaissé, attendu, retards, dépenses, incidents, entretiens à venir. Rédige ensuite un rapport court et clair.",
    input: z.object({ month: month.optional() }),
  },
  get_incidents: {
    kind: "read",
    label: "Consultation des incidents",
    description: "Incidents et interventions, avec leurs devis.",
    input: z.object({ status: z.enum(["OPEN", "ALL"]).optional() }),
  },
  get_documents: {
    kind: "read",
    label: "Consultation des documents",
    description: "Documents classés (baux, titres, quittances, factures, assurances, déclarations), pour un bien ou tous.",
    input: z.object({ assetId: z.string().optional() }),
  },
  run_compliance_check: {
    kind: "read",
    label: "Contrôle de gestion",
    description:
      "Lance le contrôle de gestion : pièces manquantes, fiscalité, retards, contrats qui se terminent, incidents bloqués, entretien. Renvoie les points à traiter, classés par gravité. À utiliser pour « est-ce que tout est en ordre ? ».",
    input: z.object({}),
  },
  get_valuation: {
    kind: "read",
    label: "Évaluation des biens",
    description:
      "Évaluation indicative d'un bien (assetId) ou de tous : valeur globale et par unité, méthode (revenu capitalisé au rendement de référence, prix d'achat), fourchette, fiabilité, documents disponibles et ce qui manque. Pour affiner, appuyez-vous sur les documents joints (expertise, titre, photos) et expliquez votre raisonnement ; ne présentez jamais une valeur comme certaine.",
    input: z.object({ assetId: z.string().optional() }),
  },
  get_appraisal_questions: {
    kind: "read",
    label: "Questions d'expertise",
    description:
      "Questions qu'un expert pose pour évaluer un bien (maisons, appartements et plantations uniquement), avec les réponses déjà connues (prefill) et les choix possibles. Menez l'entretien dans le chat comme un expert : une ou deux questions à la fois, proposez de confirmer les réponses connues, puis appelez submit_appraisal avec les codes des réponses.",
    input: z.object({ assetId: z.string() }),
  },
  get_owner_passport: {
    kind: "read",
    label: "Passeport propriétaire",
    description:
      "Profil financier du propriétaire pour une banque : score sur 1000 et ses critères, loyers certifiés sur 12 mois, taux d'encaissement, occupation, patrimoine, et capacité d'emprunt indicative (70 % des loyers retenus, endettement plafonné). Paramètres facultatifs pour simuler : autres revenus et crédits en cours (mensuels, unité mineure), durée en années, loyer attendu du bien à financer. Toujours préciser que ce n'est pas une offre de prêt.",
    input: z.object({ otherIncome: minor.optional(), existingLoans: minor.optional(), years: z.number().int().min(1).max(30).optional(), projectRent: minor.optional() }),
  },
  get_patrimony: {
    kind: "read",
    label: "Patrimoine familial",
    description: "Valeur du patrimoine, part de chaque membre de la famille (propriétaire et proches invités), biens de famille et leurs parts, état des invitations.",
    input: z.object({}),
  },
  file_document: {
    kind: "write",
    risk: "low",
    label: "Classement d'un document",
    description:
      "Classe une pièce jointe envoyée dans la conversation (identifiant « pj-… ») dans les documents d'un bien : bail, état des lieux, titre, quittance, facture, assurance, déclaration fiscale, enregistrement, photo. Lisez d'abord la pièce pour choisir le type, le bien et, s'il y a lieu, le contrat (agreementId) et l'année fiscale.",
    input: z.object({
      attachmentId: z.string(),
      assetId: z.string(),
      kind: DocumentKind,
      label: z.string().min(1).describe("Libellé court, par exemple « Attestation d'assurance 2026 »"),
      agreementId: z.string().optional(),
      year: z.number().int().optional(),
    }),
  },
  add_expense: {
    kind: "write",
    risk: "high",
    label: "Ajout d'une dépense",
    description: "Enregistre une dépense sur un bien (réparation, taxe, assurance, entretien).",
    input: z.object({
      assetId: z.string(),
      label: z.string().min(1),
      category: z.enum(["REPAIR", "TAX", "INSURANCE", "MAINTENANCE", "FEES", "OTHER"]),
      amount: minor,
      currency: Currency,
      date: date.optional(),
    }),
  },
  create_asset: {
    kind: "write",
    risk: "low",
    label: "Création d'un bien",
    description: `Crée un actif avec ses unités. Types et sous-types (kind) : ${Object.values(ASSET_PROFILES)
      .map((p) => `${p.type} (${p.label}, unités = ${p.unit.many}) : ${Object.keys(p.kinds).join(", ")}`)
      .join(" ; ")}.`,
    input: z.object({
      type: AssetType.default("REAL_ESTATE"),
      name: z.string().min(1),
      kind: z.string().describe("Sous-type du type choisi, par exemple HOUSE, COCOA, TAXI"),
      address: z.string(),
      city: z.string(),
      country: z.string().length(2).describe("Code pays ISO, par exemple CI ou FR"),
      currency: Currency,
      units: z
        .array(
          z.object({
            label: z.string(),
            measure: z.number().positive().optional().describe("Pièces (immobilier), hectares (plantation), têtes (élevage), m² (commerce)"),
            askingRent: minor.optional(),
          }),
        )
        .min(1),
    }),
  },
  invite_occupant: {
    kind: "write",
    risk: "high",
    label: "Invitation d'un occupant",
    description: "Crée le contrat de location d'un logement libre et invite l'occupant par SMS.",
    input: z.object({
      assetId: z.string(),
      unitId: z.string(),
      firstName: z.string().min(1),
      lastName: z.string().min(1),
      phone: z.string().describe("Numéro au format international, par exemple +2250700000000"),
      startDate: date,
      rent: minor,
      deposit: minor,
      currency: Currency,
      dueDay: z.number().int().min(1).max(28),
    }),
  },
  update_lease: {
    kind: "write",
    risk: "high",
    label: "Modification d'un contrat",
    description: "Modifie un contrat en cours : montant périodique (loyer, redevance, versement), caution, jour d'échéance ou date de fin. Les échéances futures non payées sont recalculées ; le passé ne change pas.",
    input: z.object({
      agreementId: z.string(),
      amount: minor.optional(),
      deposit: minor.optional(),
      dueDay: z.number().int().min(1).max(28).optional(),
      endDate: date.optional(),
    }),
  },
  update_unit: {
    kind: "write",
    risk: "low",
    label: "Modification d'une unité",
    description: "Renomme une unité (logement, parcelle, véhicule…) ou change le montant demandé pour le prochain occupant.",
    input: z.object({ unitId: z.string(), label: z.string().min(1).optional(), askingRent: minor.optional(), measure: z.number().positive().optional() }),
  },
  set_asset_value: {
    kind: "write",
    risk: "low",
    label: "Valeur d'un bien",
    description: "Enregistre la valeur estimée d'un bien et, si utile, celle de chaque unité. Sert au patrimoine et à la part de chacun.",
    input: z.object({
      assetId: z.string(),
      value: minor,
      unitValues: z.array(z.object({ unitId: z.string(), value: minor })).optional(),
    }),
  },
  submit_appraisal: {
    kind: "write",
    risk: "low",
    label: "Expertise d'un bien",
    description:
      "Calcule l'estimation d'expert à partir des réponses de l'entretien (codes des options, nombres pour les surfaces ; null si le propriétaire passe) et l'enregistre. apply=true la retient comme valeur du bien. Présentez ensuite la valeur, la fourchette et les facteurs renvoyés, sans en inventer.",
    input: z.object({
      assetId: z.string(),
      answers: z.record(z.string(), z.union([z.string(), z.number(), z.array(z.string()), z.null()])),
      apply: z.boolean().default(false),
    }),
  },
  invite_family_member: {
    kind: "write",
    risk: "high",
    label: "Invitation d'un proche",
    description: "Ajoute un membre de la famille qui pourra suivre les biens et la valeur de sa part. access : VIEW (consulter) ou MANAGE (co-gérer). Téléphone au format international.",
    input: z.object({
      firstName: z.string().min(1),
      lastName: z.string(),
      phone: z.string().regex(/^\+\d{8,15}$/),
      relation: z.string().describe("Conjoint, Enfant, Frère, Sœur, Mère, Père, Cousin, Autre"),
      access: z.enum(["VIEW", "MANAGE"]).default("VIEW"),
    }),
  },
  set_family_shares: {
    kind: "write",
    risk: "high",
    label: "Parts d'un bien de famille",
    description: "Déclare un bien comme bien de famille et fixe les parts en pour mille (total 1000). holderId : l'identifiant du propriétaire (ownerId) ou d'un proche (get_patrimony).",
    input: z.object({
      assetId: z.string(),
      shares: z.array(z.object({ holderId: z.string(), sharePermille: z.number().int().min(1).max(1000) })).min(1),
    }),
  },
  send_reminder: {
    kind: "write",
    risk: "high",
    label: "Envoi d'une relance",
    description: "Envoie une relance de paiement à l'occupant d'un contrat.",
    input: z.object({ agreementId: z.string(), tone: z.enum(["COURTEOUS", "FIRM", "FINAL"]) }),
  },
  send_message: {
    kind: "write",
    risk: "high",
    label: "Envoi d'un message",
    description: "Envoie un message à un occupant ou un intervenant.",
    input: z.object({ partyId: z.string(), text: z.string().min(1) }),
  },
  request_quotes: {
    kind: "write",
    risk: "low",
    label: "Demande de devis",
    description: "Ouvre une demande d'intervention et sollicite des devis auprès d'artisans de l'annuaire. Pour un incident existant, passer eventId.",
    input: z.object({
      assetId: z.string(),
      eventId: z.string().optional(),
      title: z.string().min(1),
      description: z.string(),
      category: z.enum(["PLUMBING", "ELECTRICITY", "AIR_CONDITIONING", "PAINTING", "LOCKSMITH", "SEPTIC", "OTHER"]),
      urgency: Urgency,
    }),
  },
  approve_quote: {
    kind: "write",
    risk: "high",
    label: "Validation d'un devis",
    description: "Valide un devis : l'artisan est confirmé sur son créneau.",
    input: z.object({ eventId: z.string(), quoteId: z.string() }),
  },
  resolve_incident: {
    kind: "write",
    risk: "low",
    label: "Clôture d'un incident",
    description: "Marque un incident comme résolu.",
    input: z.object({ eventId: z.string() }),
  },
  schedule_maintenance: {
    kind: "write",
    risk: "low",
    label: "Programmation d'un entretien",
    description: "Programme un entretien préventif récurrent (climatisation, fosse septique, peinture, toiture…).",
    input: z.object({ assetId: z.string(), label: z.string().min(1), everyMonths: z.number().int().min(1).max(120), nextDueOn: date }),
  },
  assign_mission: {
    kind: "write",
    risk: "low",
    label: "Mission terrain",
    description: "Confie une mission à un gérant terrain : visite, contrôle, état des lieux, remise de clés. Sans gérant enregistré, fournir son nom et son téléphone.",
    input: z.object({
      assetId: z.string(),
      kind: MissionKind,
      title: z.string().min(1),
      dueDate: date,
      managerPartyId: z.string().optional(),
      managerName: z.string().optional(),
      managerPhone: z.string().optional(),
    }),
  },
  get_autonomous_activity: {
    kind: "read",
    label: "Ce que Keyo a fait",
    description:
      "Activité de Keyo en l'absence du propriétaire : actions faites seul (relances, quittances, incidents qualifiés…), demandes en attente de son accord (avec leur identifiant), dernier passage, et réglages d'autonomie (interrupteur, niveau par action, plafond de dépense). À utiliser pour « qu'as-tu fait ? », « qu'est-ce qui attend mon accord ? ».",
    input: z.object({}),
  },
  decide_pending_action: {
    kind: "write",
    risk: "high",
    label: "Décision sur une demande",
    description: "Accepte (APPROVE) ou refuse (REJECT) une action en attente de l'accord du propriétaire (identifiant donné par get_autonomous_activity). Acceptée, l'action est revérifiée puis exécutée.",
    input: z.object({ actionId: z.string(), decision: z.enum(["APPROVE", "REJECT"]) }),
  },
  undo_autonomous_action: {
    kind: "write",
    risk: "low",
    label: "Annulation d'une action",
    description: "Annule une action de Keyo tant qu'elle n'a pas produit d'effet hors de l'app (un message déjà envoyé ne peut pas être repris).",
    input: z.object({ actionId: z.string() }),
  },
  set_autonomy: {
    kind: "write",
    risk: "high",
    label: "Réglage de l'autonomie",
    description:
      "Change ce que Keyo peut faire seul : enabled (interrupteur général), le niveau d'une action (OFF jamais, ASK me demander, NOTIFY faire et me prévenir, AUTO faire seul ; certaines actions sont plafonnées), ou le plafond de dépense sans accord (spendCap, unité mineure, devise d'affichage).",
    input: z.object({
      enabled: z.boolean().optional(),
      action: z.enum(AUTONOMOUS_ACTION_KEYS as [string, ...string[]]).optional(),
      level: AutonomyLevel.optional(),
      spendCap: minor.optional(),
    }),
  },
  run_autonomous_pass: {
    kind: "write",
    risk: "low",
    label: "Passage de l'agent",
    description: "Lance tout de suite un passage de Keyo en mode autonome (relances, quittances, incidents, conformité), selon les réglages d'autonomie, et renvoie le compte rendu.",
    input: z.object({}),
  },
} satisfies Record<string, ToolDef>;

export type AgentToolName = keyof typeof AGENT_TOOLS;
export type AgentToolInput<N extends AgentToolName> = z.infer<(typeof AGENT_TOOLS)[N]["input"]>;

export const isAgentTool = (name: string): name is AgentToolName => name in AGENT_TOOLS;

/** Faut-il l'accord du propriétaire avant d'exécuter cet outil ? */
export function needsConfirmation(name: AgentToolName, policy: "ALWAYS" | "RISKY"): boolean {
  const def: ToolDef = AGENT_TOOLS[name];
  if (def.kind === "read") return false;
  return policy === "ALWAYS" || def.risk === "high";
}

/** Définitions au format attendu par l'API Claude (JSON Schema). */
export function agentToolSchemas() {
  return (Object.entries(AGENT_TOOLS) as [AgentToolName, ToolDef][]).map(([name, def]) => {
    const { $schema: _ignored, ...schema } = z.toJSONSchema(def.input) as Record<string, unknown>;
    return { name, description: def.description, input_schema: { ...schema, type: "object" as const } };
  });
}
