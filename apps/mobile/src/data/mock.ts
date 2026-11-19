import {
  type AssetShare,
  addMonths,
  buildMonthlySchedule,
  dueStatus,
  type Agreement,
  type Asset,
  type AssetEvent,
  type AssetUnit,
  type Document,
  type MaintenancePlan,
  type Mission,
  type Party,
  type ScheduleItem,
  type Transaction,
} from "@keyo/shared";
import { addDays, atHour, shiftHours } from "./period";
import type { Message, OwnerState } from "./store";

/**
 * Jeu de démonstration (reprend les maquettes), recalculé à partir de la date du jour pour rester
 * cohérent : historique payé, un loyer en retard ce mois-ci, un à venir, deux incidents ouverts.
 * Il suit le modèle générique : rien n'est spécifique à l'immobilier hors de `details`.
 */
export function createDemoState(ownerId: string, now: string): OwnerState {
  const today = now.slice(0, 10);
  const month = today.slice(0, 7);
  const XOF = (amount: number) => ({ amount, currency: "XOF" as const });

  const asset = (id: string, name: string, kind: string, address: string, lat: number, lng: number, purchasePrice: number): Asset => ({
    id,
    ownerId,
    type: "REAL_ESTATE",
    name,
    location: { address, city: "Abidjan", country: "CI", lat, lng },
    details: { kind, purchasePrice },
    currency: "XOF",
    createdAt: "2025-01-10T09:00:00.000Z",
  });
  const assets: Asset[] = [
    asset("a-cocody", "Résidence Cocody", "BUILDING", "Riviera 3, Abidjan", 5.364, -3.96, 38_000_000),
    asset("a-angre", "Duplex Angré", "HOUSE", "8e tranche, Abidjan", 5.398, -3.989, 70_000_000),
    asset("a-bingerville", "Villa Bingerville", "HOUSE", "Bingerville, Abidjan", 5.355, -3.885, 56_500_000),
    asset("a-treichville", "Local Treichville", "COMMERCIAL", "Avenue 16, Treichville", 5.292, -4.008, 26_000_000),
    asset("a-marcory", "Appart. Marcory", "APARTMENT", "Zone 4, Marcory", 5.303, -3.983, 17_500_000),
    asset("a-plateau", "Studio Plateau", "APARTMENT", "Rue du Commerce, Plateau", 5.325, -4.02, 11_000_000),
  ];

  const unit = (id: string, assetId: string, label: string, rooms: number, rent: number): AssetUnit => ({
    id,
    assetId,
    type: "DWELLING",
    label,
    details: { rooms, askingRent: rent },
  });
  const units: AssetUnit[] = [
    unit("u-cocody-a1", "a-cocody", "Appartement A1", 3, 150_000),
    unit("u-cocody-a2", "a-cocody", "Appartement A2", 2, 75_000),
    unit("u-cocody-a3", "a-cocody", "Studio A3", 1, 50_000),
    unit("u-cocody-a4", "a-cocody", "Studio A4", 1, 50_000),
    unit("u-angre", "a-angre", "Duplex", 5, 450_000),
    unit("u-bingerville", "a-bingerville", "Villa", 4, 350_000),
    unit("u-treichville", "a-treichville", "Local", 1, 180_000),
    unit("u-marcory", "a-marcory", "Appartement", 2, 120_000),
    unit("u-plateau", "a-plateau", "Studio", 1, 75_000),
  ];

  const party = (id: string, firstName: string, lastName: string, phone: string): Party => ({ id, role: "OCCUPANT", firstName, lastName, phone });
  const parties: Party[] = [
    party("p-awa", "Awa", "K.", "+2250700000001"),
    party("p-ibrahim", "Ibrahim", "B.", "+2250700000002"),
    party("p-mariam", "Mariam", "C.", "+2250700000003"),
    party("p-moussa", "Moussa", "S.", "+2250700000004"),
    party("p-fatou", "Fatou", "D.", "+2250700000005"),
    party("p-yao", "Yao", "T.", "+2250700000006"),
    party("p-koffi", "Koffi", "A.", "+2250700000007"),
    party("p-aminata", "Aminata", "S.", "+2250700000008"),
    { id: "p-gerant", role: "FIELD_MANAGER", firstName: "Serge", lastName: "K.", phone: "+2250700000009" },
    // Famille : la villa et le duplex sont des biens hérités, détenus en parts.
    { id: "p-fam-aya", role: "FAMILY", firstName: "Aya", lastName: "Komoé", phone: "+2250700000021", relation: "Sœur", access: "VIEW", invitedAt: shiftHours(now, -24 * 40), joinedAt: shiftHours(now, -24 * 38) },
    { id: "p-fam-marc", role: "FAMILY", firstName: "Marc", lastName: "Komoé", phone: "+33612345678", relation: "Frère", access: "VIEW", invitedAt: shiftHours(now, -24 * 3) },
    { id: "p-fam-mere", role: "FAMILY", firstName: "Hortense", lastName: "Komoé", phone: "+2250700000023", relation: "Mère", access: "MANAGE", invitedAt: shiftHours(now, -24 * 60), joinedAt: shiftHours(now, -24 * 59) },
  ];
  for (const a of assets) if (a.id === "a-bingerville" || a.id === "a-angre") a.holding = "FAMILY";
  const angre = assets.find((a) => a.id === "a-angre");
  if (angre) angre.value = XOF(85_000_000);
  const shares: AssetShare[] = [
    { assetId: "a-bingerville", holderId: ownerId, sharePermille: 250 },
    { assetId: "a-bingerville", holderId: "p-fam-aya", sharePermille: 250 },
    { assetId: "a-bingerville", holderId: "p-fam-marc", sharePermille: 250 },
    { assetId: "a-bingerville", holderId: "p-fam-mere", sharePermille: 250 },
    { assetId: "a-angre", holderId: ownerId, sharePermille: 500 },
    { assetId: "a-angre", holderId: "p-fam-mere", sharePermille: 500 },
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
  const agreements: Agreement[] = [
    lease("g-awa", "a-cocody", "u-cocody-a1", "p-awa", "2024-03-01", 150_000, 13),
    lease("g-ibrahim", "a-cocody", "u-cocody-a2", "p-ibrahim", "2025-06-01", 75_000, 5),
    lease("g-mariam", "a-cocody", "u-cocody-a3", "p-mariam", "2026-02-01", 50_000, 28),
    lease("g-moussa", "a-angre", "u-angre", "p-moussa", "2023-09-01", 450_000, 5),
    lease("g-fatou", "a-bingerville", "u-bingerville", "p-fatou", "2025-10-01", 350_000, 4),
    lease("g-yao", "a-treichville", "u-treichville", "p-yao", "2024-01-01", 180_000, 10),
    lease("g-koffi", "a-marcory", "u-marcory", "p-koffi", "2025-04-01", 120_000, 5),
    lease("g-aminata", "a-plateau", "u-plateau", "p-aminata", "2026-05-01", 75_000, 1),
  ];

  // Douze mois d'historique (plus le mois prochain), tous payés sauf le retard d'Awa ce mois-ci.
  const from = addMonths(month, -11);
  const schedule: ScheduleItem[] = agreements.flatMap((g) =>
    buildMonthlySchedule(g, addMonths(month, 1), today)
      .filter((it) => it.dueDate.slice(0, 7) >= from)
      .map((it) => {
        const isAwaNow = g.id === "g-awa" && it.dueDate.slice(0, 7) === month;
        const paid = it.dueDate <= today && !isAwaNow;
        const received = XOF(paid ? it.expected.amount : 0);
        return { ...it, received, status: dueStatus(it.expected, received, it.dueDate, today) };
      }),
  );

  const transactions: Transaction[] = [
    ...schedule
      .filter((s) => s.status === "PAID")
      .map((s): Transaction => {
        const g = agreements.find((a) => a.id === s.agreementId)!;
        return {
          id: `t-${s.id}`,
          assetId: g.assetId,
          scheduleItemId: s.id,
          direction: "IN",
          category: "RENT",
          amount: s.received,
          occurredAt: atHour(s.dueDate, 9),
          confirmedBy: "WEBHOOK",
          label: "Loyer",
        };
      }),
    {
      id: "t-bingerville-repair",
      assetId: "a-bingerville",
      direction: "OUT",
      category: "REPAIR",
      amount: XOF(45_000),
      occurredAt: `${today.slice(0, 4)}-04-17T15:00:00.000Z`,
      confirmedBy: "MANUAL",
      label: "Réparation du chauffe-eau",
    },
  ];

  const tomorrow = addDays(today, 1);
  const events: AssetEvent[] = [
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
      reportedAt: shiftHours(now, -2),
      photos: ["photo-1", "photo-2"],
      aiSummary: "Probablement le siphon du lavabo. Réparation estimée entre 15 000 et 30 000 FCFA.",
      quotes: [
        { id: "q-kone", provider: "Plomberie Koné", rating: 4.8, slot: atHour(tomorrow, 9), amount: XOF(18_000) },
        { id: "q-yao", provider: "Ets Yao Services", rating: 4.5, slot: atHour(addDays(today, 2), 14), amount: XOF(25_000) },
      ],
    },
    {
      id: "e-clim",
      assetId: "a-angre",
      unitId: "u-angre",
      kind: "INCIDENT",
      category: "AIR_CONDITIONING",
      title: "Climatisation en panne",
      description: "La climatisation du salon ne démarre plus",
      urgency: "MEDIUM",
      status: "SCHEDULED",
      reportedBy: "p-moussa",
      reportedAt: shiftHours(now, -72),
      scheduledAt: atHour(tomorrow, 14),
      photos: [],
      quotes: [{ id: "q-froid", provider: "Froid Services", rating: 4.6, slot: atHour(tomorrow, 14), amount: XOF(35_000) }],
    },
    {
      id: "e-serrure",
      assetId: "a-plateau",
      kind: "INCIDENT",
      category: "LOCKSMITH",
      title: "Serrure de la porte",
      description: "La serrure de la porte d'entrée se bloque",
      urgency: "MEDIUM",
      status: "RESOLVED",
      reportedAt: "2026-08-10T08:00:00.000Z",
      resolvedAt: "2026-08-12T17:00:00.000Z",
      photos: [],
      quotes: [],
    },
    {
      id: "e-disjoncteur",
      assetId: "a-cocody",
      kind: "INCIDENT",
      category: "ELECTRICITY",
      title: "Disjoncteur",
      description: "Le disjoncteur saute plusieurs fois par jour",
      urgency: "HIGH",
      status: "RESOLVED",
      reportedAt: "2026-08-02T08:00:00.000Z",
      resolvedAt: "2026-08-03T12:00:00.000Z",
      photos: [],
      quotes: [],
    },
  ];

  const receipts = schedule
    .filter((s) => s.status === "PAID" && s.agreementId === "g-fatou")
    .slice(-6)
    .map((s): Document => ({
      id: `d-quittance-${s.id}`,
      assetId: "a-bingerville",
      kind: "RECEIPT",
      label: `Quittance ${s.dueDate.slice(0, 7)}`,
      url: "",
      createdAt: atHour(s.dueDate, 10),
    }));
  // Pièces volontairement incomplètes : le contrôle de gestion a de quoi travailler.
  const name = (g: Agreement) => parties.find((p) => p.id === g.partyId)!;
  const leaseDoc = (g: Agreement, kind: Document["kind"], label: string): Document => ({
    id: `d-${kind.toLowerCase()}-${g.id}`,
    assetId: g.assetId,
    agreementId: g.id,
    kind,
    label: `${label} ${name(g).firstName} ${name(g).lastName}`,
    url: "",
    createdAt: atHour(g.startDate, 10),
  });
  const assetDoc = (assetId: string, kind: Document["kind"], label: string): Document => ({ id: `d-${kind.toLowerCase()}-${assetId}`, assetId, kind, label, url: "", createdAt: "2025-01-10T10:00:00.000Z" });
  const documents: Document[] = [
    ...agreements.filter((g) => g.id !== "g-mariam").map((g) => leaseDoc(g, "LEASE", "Bail de")),
    ...agreements.filter((g) => !["g-mariam", "g-aminata"].includes(g.id)).map((g) => leaseDoc(g, "INVENTORY", "État des lieux d'entrée,")),
    ...agreements.filter((g) => !["g-mariam", "g-koffi"].includes(g.id)).map((g) => leaseDoc(g, "REGISTRATION", "Enregistrement du bail,")),
    assetDoc("a-bingerville", "TITLE_DEED", "Titre foncier"),
    assetDoc("a-cocody", "TITLE_DEED", "ACD Résidence Cocody"),
    assetDoc("a-angre", "TITLE_DEED", "Titre foncier Angré"),
    assetDoc("a-treichville", "TITLE_DEED", "ACD Treichville"),
    assetDoc("a-marcory", "TITLE_DEED", "Acte notarié Marcory"),
    assetDoc("a-plateau", "TITLE_DEED", "ACD Plateau"),
    ...["a-cocody", "a-angre", "a-bingerville", "a-plateau"].map((id) => assetDoc(id, "INSURANCE", "Attestation d'assurance")),
    ...receipts,
  ];

  const maintenance: MaintenancePlan[] = [
    { id: "mp-clim-bingerville", assetId: "a-bingerville", label: "Entretien de la climatisation", everyMonths: 6, lastDoneOn: addDays(today, -175), nextDueOn: addDays(today, 5) },
    { id: "mp-fosse-angre", assetId: "a-angre", label: "Vidange de la fosse septique", everyMonths: 24, lastDoneOn: addDays(today, -740), nextDueOn: addDays(today, -10) },
    { id: "mp-peinture-cocody", assetId: "a-cocody", label: "Peinture des parties communes", everyMonths: 60, nextDueOn: addDays(today, 200) },
  ];
  const missions: Mission[] = [
    { id: "mi-visite-cocody", assetId: "a-cocody", partyId: "p-gerant", kind: "VISIT", title: "Visite du Studio A4 avant remise en location", dueDate: addDays(today, 3), status: "PLANNED", photos: [] },
    {
      id: "mi-controle-angre",
      assetId: "a-angre",
      partyId: "p-gerant",
      kind: "INSPECTION",
      title: "Contrôle trimestriel du duplex",
      dueDate: addDays(today, -20),
      status: "DONE",
      report: "Bon état général. Joint de la douche à refaire, signalé à l'occupant.",
      photos: [],
    },
  ];

  const messages: Message[] = [
    { id: "m1", partyId: "p-fatou", from: "PARTY", text: "Bonjour, il y a une fuite sous le lavabo de la salle de bain. J'ai envoyé des photos.", at: shiftHours(now, -2) },
    { id: "m2", partyId: "p-fatou", from: "OWNER", text: "Merci Fatou. Je regarde les devis et je vous confirme le passage du plombier.", at: shiftHours(now, -1.5) },
  ];

  return { assets, units, parties, agreements, schedule, transactions, events, documents, messages, maintenance, missions, shares, appraisals: [], passport: { shares: [] }, notificationsReadAt: shiftHours(now, -24) };
}

export function createEmptyState(): OwnerState {
  return { assets: [], units: [], parties: [], agreements: [], schedule: [], transactions: [], events: [], documents: [], messages: [], maintenance: [], missions: [], shares: [], appraisals: [], passport: { shares: [] }, notificationsReadAt: new Date(0).toISOString() };
}
