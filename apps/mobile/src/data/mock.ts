import type { Agreement, Asset, AssetEvent, AssetUnit, Document, Party, ScheduleItem, Transaction } from "@keyo/shared";

/**
 * Données fictives du propriétaire, en attendant l'API (apps/api).
 * Elles suivent le modèle générique : rien n'est spécifique à l'immobilier hors de `details`.
 * Date de référence des maquettes : 18 novembre 2026.
 */
export const TODAY = "2026-11-18";
export const NOW = "2026-11-18T18:30:00+00:00";
const OWNER = "owner-daniel";
const XOF = (amount: number) => ({ amount, currency: "XOF" as const });

export const owner = { id: OWNER, firstName: "Daniel", lastName: "K.", displayCurrency: "XOF" as const };

const asset = (id: string, name: string, kind: string, address: string, lat: number, lng: number, purchasePrice: number): Asset => ({
  id,
  ownerId: OWNER,
  type: "REAL_ESTATE",
  name,
  location: { address, city: "Abidjan", country: "CI", lat, lng },
  details: { kind, purchasePrice },
  currency: "XOF",
  createdAt: "2025-01-10T09:00:00+00:00",
});

export const assets: Asset[] = [
  asset("a-cocody", "Résidence Cocody", "BUILDING", "Riviera 3, Abidjan", 5.364, -3.96, 38_000_000),
  asset("a-angre", "Duplex Angré", "HOUSE", "8e tranche, Abidjan", 5.398, -3.989, 70_000_000),
  asset("a-bingerville", "Villa Bingerville", "HOUSE", "Bingerville, Abidjan", 5.355, -3.885, 56_500_000),
  asset("a-treichville", "Local Treichville", "COMMERCIAL", "Avenue 16, Treichville", 5.292, -4.008, 26_000_000),
  asset("a-marcory", "Appart. Marcory", "APARTMENT", "Zone 4, Marcory", 5.303, -3.983, 17_500_000),
  asset("a-plateau", "Studio Plateau", "APARTMENT", "Rue du Commerce, Plateau", 5.325, -4.02, 11_000_000),
];

const unit = (id: string, assetId: string, label: string, rooms: number): AssetUnit => ({
  id,
  assetId,
  type: "DWELLING",
  label,
  details: { rooms },
});

export const units: AssetUnit[] = [
  unit("u-cocody-a1", "a-cocody", "Appartement A1", 3),
  unit("u-cocody-a2", "a-cocody", "Appartement A2", 2),
  unit("u-cocody-a3", "a-cocody", "Studio A3", 1),
  unit("u-angre", "a-angre", "Duplex", 5),
  unit("u-bingerville", "a-bingerville", "Villa", 4),
  unit("u-treichville", "a-treichville", "Local", 1),
  unit("u-marcory", "a-marcory", "Appartement", 2),
  unit("u-plateau", "a-plateau", "Studio", 1),
];

const party = (id: string, firstName: string, lastName: string, phone: string): Party => ({
  id,
  role: "OCCUPANT",
  firstName,
  lastName,
  phone,
});

export const parties: Party[] = [
  party("p-awa", "Awa", "K.", "+2250700000001"),
  party("p-ibrahim", "Ibrahim", "B.", "+2250700000002"),
  party("p-mariam", "Mariam", "C.", "+2250700000003"),
  party("p-moussa", "Moussa", "S.", "+2250700000004"),
  party("p-fatou", "Fatou", "D.", "+2250700000005"),
  party("p-yao", "Yao", "T.", "+2250700000006"),
  party("p-koffi", "Koffi", "A.", "+2250700000007"),
  party("p-aminata", "Aminata", "S.", "+2250700000008"),
];

const lease = (id: string, assetId: string, unitId: string, partyId: string, startDate: string, rent: number, dueDay: number): Agreement => ({
  id,
  assetId,
  unitId,
  kind: "LEASE",
  partyId,
  startDate,
  periodicAmount: XOF(rent),
  deposit: XOF(rent * 2),
  dueDay,
  period: "MONTHLY",
});

export const agreements: Agreement[] = [
  lease("g-awa", "a-cocody", "u-cocody-a1", "p-awa", "2024-03-01", 150_000, 13),
  lease("g-ibrahim", "a-cocody", "u-cocody-a2", "p-ibrahim", "2025-06-01", 75_000, 5),
  lease("g-mariam", "a-cocody", "u-cocody-a3", "p-mariam", "2026-02-01", 50_000, 25),
  lease("g-moussa", "a-angre", "u-angre", "p-moussa", "2023-09-01", 450_000, 5),
  lease("g-fatou", "a-bingerville", "u-bingerville", "p-fatou", "2025-10-01", 350_000, 5),
  lease("g-yao", "a-treichville", "u-treichville", "p-yao", "2024-01-01", 180_000, 10),
  lease("g-koffi", "a-marcory", "u-marcory", "p-koffi", "2025-04-01", 120_000, 5),
  lease("g-aminata", "a-plateau", "u-plateau", "p-aminata", "2026-05-01", 75_000, 1),
];

/** Échéancier de novembre. Les statuts seront calculés côté serveur par la tâche quotidienne. */
export const schedule: ScheduleItem[] = agreements.map((g) => {
  const dueDate = `2026-11-${String(g.dueDay).padStart(2, "0")}`;
  const status = g.id === "g-awa" ? "LATE" : g.id === "g-mariam" ? "UPCOMING" : "PAID";
  return {
    id: `s-${g.id}-2026-11`,
    agreementId: g.id,
    dueDate,
    expected: g.periodicAmount,
    received: XOF(status === "PAID" ? g.periodicAmount.amount : 0),
    status,
  };
});

/** Encaissements (confirmés par webhook) et dépenses. Historique 2026 de la villa pour l'assistant. */
export const transactions: Transaction[] = [
  ...Array.from({ length: 11 }, (_, i): Transaction => {
    const m = String(i + 1).padStart(2, "0");
    return {
      id: `t-bingerville-2026-${m}`,
      assetId: "a-bingerville",
      direction: "IN",
      category: "RENT",
      amount: XOF(350_000),
      occurredAt: `2026-${m}-04T10:00:00+00:00`,
      confirmedBy: "WEBHOOK",
      label: "Loyer",
    };
  }),
  {
    id: "t-bingerville-repair-04",
    assetId: "a-bingerville",
    direction: "OUT",
    category: "REPAIR",
    amount: XOF(45_000),
    occurredAt: "2026-04-17T15:00:00+00:00",
    confirmedBy: "MANUAL",
    label: "Réparation du chauffe-eau",
  },
  ...schedule
    .filter((s) => s.status === "PAID" && s.agreementId !== "g-fatou")
    .map((s): Transaction => {
      const g = agreements.find((a) => a.id === s.agreementId)!;
      return {
        id: `t-${s.id}`,
        assetId: g.assetId,
        scheduleItemId: s.id,
        direction: "IN",
        category: "RENT",
        amount: s.received,
        occurredAt: `${s.dueDate}T09:00:00+00:00`,
        confirmedBy: "WEBHOOK",
        label: "Loyer",
      };
    }),
];

export const events: AssetEvent[] = [
  {
    id: "e-fuite",
    assetId: "a-bingerville",
    unitId: "u-bingerville",
    kind: "INCIDENT",
    category: "PLUMBING",
    title: "Fuite d'eau",
    description: "Fuite d'eau dans la salle de bain",
    urgency: "HIGH",
    status: "QUOTES_PENDING",
    reportedBy: "p-fatou",
    reportedAt: "2026-11-18T16:30:00+00:00",
    photos: ["photo-1", "photo-2"],
    aiSummary: "Probablement le siphon du lavabo. Réparation estimée entre 15 000 et 30 000 FCFA.",
    quotes: [
      { id: "q-kone", provider: "Plomberie Koné", rating: 4.8, slot: "2026-11-19T09:00:00+00:00", amount: XOF(18_000) },
      { id: "q-yao", provider: "Ets Yao Services", rating: 4.5, slot: "2026-11-19T14:00:00+00:00", amount: XOF(25_000) },
    ],
  },
  {
    id: "e-clim",
    assetId: "a-angre",
    unitId: "u-angre",
    kind: "INCIDENT",
    category: "AIR_CONDITIONING",
    title: "Climatisation en panne",
    description: "La climatisation du salon ne démarre plus.",
    urgency: "MEDIUM",
    status: "SCHEDULED",
    reportedBy: "p-moussa",
    reportedAt: "2026-11-16T08:00:00+00:00",
    scheduledAt: "2026-11-19T14:00:00+00:00",
    photos: [],
    quotes: [],
  },
  {
    id: "e-serrure",
    assetId: "a-plateau",
    kind: "INCIDENT",
    category: "LOCKSMITH",
    title: "Serrure de la porte",
    description: "La serrure de la porte d'entrée se bloque.",
    urgency: "MEDIUM",
    status: "RESOLVED",
    reportedAt: "2026-08-10T08:00:00+00:00",
    resolvedAt: "2026-08-12T17:00:00+00:00",
    photos: [],
    quotes: [],
  },
  {
    id: "e-disjoncteur",
    assetId: "a-cocody",
    kind: "INCIDENT",
    category: "ELECTRICITY",
    title: "Disjoncteur",
    description: "Le disjoncteur saute plusieurs fois par jour.",
    urgency: "HIGH",
    status: "RESOLVED",
    reportedAt: "2026-08-02T08:00:00+00:00",
    resolvedAt: "2026-08-03T12:00:00+00:00",
    photos: [],
    quotes: [],
  },
];

export const documents: Document[] = [
  { id: "d-bail-fatou", assetId: "a-bingerville", kind: "LEASE", label: "Bail de Fatou D.", url: "", createdAt: "2025-09-28T10:00:00+00:00" },
  { id: "d-titre-bingerville", assetId: "a-bingerville", kind: "TITLE_DEED", label: "Titre foncier", url: "", createdAt: "2025-01-10T10:00:00+00:00" },
  ...["06", "07", "08", "09", "10", "11"].map((m) => ({
    id: `d-quittance-bingerville-${m}`,
    assetId: "a-bingerville",
    kind: "RECEIPT" as const,
    label: `Quittance 2026-${m}`,
    url: "",
    createdAt: `2026-${m}-05T10:00:00+00:00`,
  })),
];
