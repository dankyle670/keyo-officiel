import { z } from "zod";
import { Currency } from "./money.ts";
import { DocumentKind, MissionKind, Urgency } from "./domain.ts";
import { RealEstateKind } from "./modules/real-estate.ts";

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
    description: "Crée un bien immobilier avec ses logements.",
    input: z.object({
      name: z.string().min(1),
      kind: RealEstateKind,
      address: z.string(),
      city: z.string(),
      country: z.string().length(2).describe("Code pays ISO, par exemple CI ou FR"),
      currency: Currency,
      units: z.array(z.object({ label: z.string(), rooms: z.number().int().positive(), askingRent: minor.optional() })).min(1),
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
