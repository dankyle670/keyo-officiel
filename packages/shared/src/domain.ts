import { z } from "zod";
import { Currency, Money } from "./money.ts";

/**
 * Modèle générique (docs/ROADMAP.md, section 2). Le cœur ne parle jamais de « loyer » ni de
 * « locataire » : l'immobilier est le premier module, via Asset.type et les schémas de `details`.
 */
export const Id = z.string().min(1);
export const IsoDate = z.iso.date();
export const IsoDateTime = z.iso.datetime({ offset: true });

export const AssetType = z.enum(["REAL_ESTATE", "PLANTATION", "FARM", "VEHICLE", "SHOP"]);
export type AssetType = z.infer<typeof AssetType>;

export const Location = z.object({
  address: z.string(),
  city: z.string(),
  country: z.string().length(2),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  /** Polygone GPS, pour une parcelle (Phase 4). */
  polygon: z.array(z.tuple([z.number(), z.number()])).optional(),
});
export type Location = z.infer<typeof Location>;

/** Bien personnel, ou bien de famille détenu en parts (indivision). */
export const Holding = z.enum(["PERSONAL", "FAMILY"]);
export type Holding = z.infer<typeof Holding>;

export const Asset = z.object({
  id: Id,
  ownerId: Id,
  holding: Holding.optional(),
  /** Valeur estimée actuelle ; à défaut, le prix d'achat sert de valeur. */
  value: Money.optional(),
  type: AssetType,
  name: z.string().min(1),
  location: Location,
  /** Champs propres au type, validés par le schéma du module (voir modules/). */
  details: z.record(z.string(), z.unknown()),
  currency: Currency,
  createdAt: IsoDateTime,
});
export type Asset = z.infer<typeof Asset>;

export const AssetUnit = z.object({
  id: Id,
  assetId: Id,
  type: z.string(),
  label: z.string(),
  details: z.record(z.string(), z.unknown()),
});
export type AssetUnit = z.infer<typeof AssetUnit>;

export const PartyRole = z.enum(["OCCUPANT", "FIELD_MANAGER", "OPERATOR", "CRAFTSMAN", "FAMILY"]);
export type PartyRole = z.infer<typeof PartyRole>;

export const Party = z.object({
  id: Id,
  role: PartyRole,
  firstName: z.string(),
  lastName: z.string(),
  phone: z.string(),
  /** Membre de la famille : lien de parenté, droits et état de l'invitation. */
  relation: z.string().optional(),
  access: z.enum(["VIEW", "MANAGE"]).optional(),
  invitedAt: IsoDateTime.optional(),
  joinedAt: IsoDateTime.optional(),
});
export type Party = z.infer<typeof Party>;

/** Part d'un détenteur dans un bien de famille, en pour mille. Le détenteur est le propriétaire (son id) ou un membre (Party). */
export const AssetShare = z.object({
  assetId: Id,
  holderId: Id,
  sharePermille: z.number().int().min(1).max(1000),
});
export type AssetShare = z.infer<typeof AssetShare>;

export const AgreementKind = z.enum(["LEASE", "MANAGEMENT", "OPERATION"]);
export const Agreement = z.object({
  id: Id,
  assetId: Id,
  unitId: Id,
  kind: AgreementKind,
  partyId: Id,
  startDate: IsoDate,
  endDate: IsoDate.optional(),
  /** Montant périodique (loyer pour un bail). */
  periodicAmount: Money,
  deposit: Money.optional(),
  /** Jour d'échéance dans la période (1 à 28). */
  dueDay: z.number().int().min(1).max(28),
  period: z.enum(["DAILY", "WEEKLY", "MONTHLY", "SEASONAL"]),
});
export type Agreement = z.infer<typeof Agreement>;

/** Statut d'une échéance, calculé côté serveur par une tâche quotidienne. */
export const DueStatus = z.enum(["UPCOMING", "PAID", "LATE", "PARTIAL", "UNPAID"]);
export type DueStatus = z.infer<typeof DueStatus>;

export const ScheduleItem = z.object({
  id: Id,
  agreementId: Id,
  dueDate: IsoDate,
  expected: Money,
  /** Somme confirmée par webhook uniquement. */
  received: Money,
  status: DueStatus,
});
export type ScheduleItem = z.infer<typeof ScheduleItem>;

export const TransactionDirection = z.enum(["IN", "OUT"]);
export const Transaction = z.object({
  id: Id,
  assetId: Id,
  scheduleItemId: Id.optional(),
  direction: TransactionDirection,
  category: z.string(),
  amount: Money,
  occurredAt: IsoDateTime,
  /** Un encaissement n'existe qu'après confirmation par webhook de l'opérateur. */
  confirmedBy: z.enum(["WEBHOOK", "MANUAL"]),
  label: z.string(),
});
export type Transaction = z.infer<typeof Transaction>;

export const EventKind = z.enum(["INCIDENT", "INTERVENTION", "HARVEST", "BIRTH", "BREAKDOWN"]);
export const Urgency = z.enum(["LOW", "MEDIUM", "HIGH"]);
export const EventStatus = z.enum(["OPEN", "QUOTES_PENDING", "SCHEDULED", "RESOLVED"]);

export const Quote = z.object({
  id: Id,
  provider: z.string(),
  rating: z.number().min(0).max(5),
  slot: IsoDateTime,
  amount: Money,
});
export type Quote = z.infer<typeof Quote>;

export const AssetEvent = z.object({
  id: Id,
  assetId: Id,
  unitId: Id.optional(),
  kind: EventKind,
  category: z.string(),
  title: z.string(),
  description: z.string(),
  urgency: Urgency,
  status: EventStatus,
  reportedBy: Id.optional(),
  reportedAt: IsoDateTime,
  scheduledAt: IsoDateTime.optional(),
  resolvedAt: IsoDateTime.optional(),
  photos: z.array(z.string()),
  /** Analyse IA (qualification de l'incident), Phase 2. */
  aiSummary: z.string().optional(),
  quotes: z.array(Quote),
});
export type AssetEvent = z.infer<typeof AssetEvent>;

export const DocumentKind = z.enum([
  "LEASE",
  "TITLE_DEED",
  "RECEIPT",
  "INVOICE",
  "INVENTORY",
  "PHOTO",
  "REPORT",
  /** Assurance du bien (propriétaire non occupant, multirisque). */
  "INSURANCE",
  /** Déclaration ou avis fiscal (revenus fonciers, impôt foncier). */
  "TAX_FILING",
  /** Preuve d'enregistrement d'un contrat auprès de l'administration fiscale. */
  "REGISTRATION",
  /** Rapport d'expertise ou avis de valeur (notaire, expert, agence). */
  "APPRAISAL",
]);
export type DocumentKind = z.infer<typeof DocumentKind>;

export const Document = z.object({
  id: Id,
  assetId: Id,
  kind: DocumentKind,
  /** Contrat auquel la pièce se rattache (bail, état des lieux), si elle en dépend. */
  agreementId: Id.optional(),
  /** Année fiscale couverte (déclarations, avis d'imposition). */
  year: z.number().int().optional(),
  label: z.string(),
  url: z.string(),
  createdAt: IsoDateTime,
});
export type Document = z.infer<typeof Document>;

/** Entretien préventif récurrent d'un actif (climatisation, fosse, peinture, vidange…). */
export const MaintenancePlan = z.object({
  id: Id,
  assetId: Id,
  label: z.string().min(1),
  everyMonths: z.number().int().min(1).max(120),
  lastDoneOn: IsoDate.optional(),
  nextDueOn: IsoDate,
});
export type MaintenancePlan = z.infer<typeof MaintenancePlan>;

/** Mission confiée à un intervenant terrain (gérant, opérateur) : visite, contrôle, remise de clés. */
export const MissionKind = z.enum(["VISIT", "INSPECTION", "KEY_HANDOVER", "COLLECTION", "OTHER"]);
export type MissionKind = z.infer<typeof MissionKind>;
export const Mission = z.object({
  id: Id,
  assetId: Id,
  partyId: Id,
  kind: MissionKind,
  title: z.string().min(1),
  dueDate: IsoDate,
  status: z.enum(["PLANNED", "DONE", "CANCELLED"]),
  /** Compte rendu de l'intervenant, avec photos (Phase 2). */
  report: z.string().optional(),
  photos: z.array(z.string()),
});
export type Mission = z.infer<typeof Mission>;
