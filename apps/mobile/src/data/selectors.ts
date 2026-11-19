import { holderPatrimony, runAudit, sharesOf, totalPatrimony, type Party, type Patrimony } from "@keyo/shared";
import { daysBetween, formatMoney, sumMoney, type Asset, type AssetEvent, type Currency, type Money, type StatusTone } from "@keyo/shared";
import type { OwnerState } from "./store";

const monthOf = (isoDate: string) => isoDate.slice(0, 7);

export type RentLine = {
  scheduleItemId: string;
  assetId: string;
  assetName: string;
  partyName: string;
  initials: string;
  expected: Money;
  received: Money;
  status: "PAID" | "LATE" | "UPCOMING" | "PARTIAL" | "UNPAID";
  dueDate: string;
  daysLate: number;
  agreementStart: string;
  agreementId: string;
};

export const partyName = (s: OwnerState, partyId: string) => {
  const p = s.parties.find((x) => x.id === partyId);
  return p ? `${p.firstName} ${p.lastName}` : "Inconnu";
};
export const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .map((w) => w[0] ?? "")
    .join("")
    .replace(/\./g, "")
    .slice(0, 2)
    .toUpperCase();

/** Lignes de loyers d'un mois (« 2026-11 »), tous biens confondus. */
export function rentLines(s: OwnerState, month: string, today: string): RentLine[] {
  return s.schedule
    .filter((it) => monthOf(it.dueDate) === month)
    .map((it) => {
      const g = s.agreements.find((a) => a.id === it.agreementId)!;
      const asset = s.assets.find((a) => a.id === g.assetId)!;
      const name = partyName(s, g.partyId);
      return {
        scheduleItemId: it.id,
        assetId: asset.id,
        assetName: asset.name,
        partyName: name,
        initials: initialsOf(name),
        expected: it.expected,
        received: it.received,
        status: it.status,
        dueDate: it.dueDate,
        agreementStart: g.startDate,
        agreementId: g.id,
        daysLate: it.status === "LATE" || it.status === "UNPAID" ? Math.max(0, daysBetween(it.dueDate, today)) : 0,
      };
    });
}

export function monthSummary(s: OwnerState, month: string, today: string, currency: Currency) {
  const lines = rentLines(s, month, today).filter((l) => l.expected.currency === currency);
  const paid = lines.filter((l) => l.status === "PAID");
  const late = lines.filter((l) => l.status === "LATE" || l.status === "UNPAID" || l.status === "PARTIAL");
  const upcoming = lines.filter((l) => l.status === "UPCOMING");
  return {
    lines,
    paid,
    late,
    upcoming,
    expected: sumMoney(lines.map((l) => l.expected), currency),
    received: sumMoney(lines.map((l) => l.received), currency),
    lateAmount: sumMoney(late.map((l) => ({ amount: l.expected.amount - l.received.amount, currency })), currency),
    upcomingAmount: sumMoney(upcoming.map((l) => l.expected), currency),
  };
}

export const isOpenEvent = (e: AssetEvent) => e.status !== "RESOLVED";

/** Ce qui demande une action au propriétaire : retards et incidents en attente de décision. */
export type TodoItem =
  | { kind: "late"; id: string; title: string; subtitle: string; amount: Money; assetId: string; agreementId: string }
  | { kind: "event"; id: string; title: string; subtitle: string; eventId: string; category: string };

export function todoItems(s: OwnerState, month: string, today: string, currency: Currency): TodoItem[] {
  const late = monthSummary(s, month, today, currency).late.map(
    (l): TodoItem => ({
      kind: "late",
      id: l.scheduleItemId,
      title: "Loyer en retard",
      subtitle: `${l.partyName}, ${l.daysLate} jour${l.daysLate > 1 ? "s" : ""} de retard`,
      amount: { amount: l.expected.amount - l.received.amount, currency },
      assetId: l.assetId,
      agreementId: l.agreementId,
    }),
  );
  const pending = s.events
    .filter((e) => e.status === "QUOTES_PENDING" || e.status === "OPEN")
    .map((e): TodoItem => {
      const asset = s.assets.find((a) => a.id === e.assetId)!;
      const n = e.quotes.length;
      return {
        kind: "event",
        id: e.id,
        eventId: e.id,
        category: e.category,
        title: n > 0 ? `${e.title}, ${n} devis reçu${n > 1 ? "s" : ""}` : e.title,
        subtitle: asset.name,
      };
    });
  return [...late, ...pending];
}

/** Statut affiché sur la carte et dans la liste des biens. */
export function assetHealth(s: OwnerState, assetId: string, month: string, today: string): { tone: StatusTone; label: string; mapLabel?: string } {
  const lateCount = rentLines(s, month, today).filter((l) => l.assetId === assetId && (l.status === "LATE" || l.status === "UNPAID")).length;
  const incidentCount = s.events.filter((e) => e.assetId === assetId && isOpenEvent(e)).length;
  if (lateCount > 0) {
    const label = lateCount > 1 ? `${lateCount} retards` : "1 retard";
    return { tone: "late", label, mapLabel: label };
  }
  if (incidentCount > 0) {
    const label = incidentCount > 1 ? `${incidentCount} incidents` : "1 incident";
    return { tone: "danger", label, mapLabel: label };
  }
  return { tone: "paid", label: "Tout est payé" };
}

/** Bail en cours à une date donnée (commencé, et pas encore terminé). */
export const isActiveLease = (g: { startDate: string; endDate?: string }, on: string) => g.startDate <= on && (!g.endDate || g.endDate >= on);
/** Bail signé, en cours ou à venir. */
export const isCurrentLease = (g: { endDate?: string }, on: string) => !g.endDate || g.endDate >= on;

export function assetSummary(s: OwnerState, asset: Asset, on: string = new Date().toISOString().slice(0, 10)) {
  const units = s.units.filter((u) => u.assetId === asset.id);
  const leases = s.agreements.filter((g) => g.assetId === asset.id && g.kind === "LEASE" && isCurrentLease(g, on));
  const monthlyRent = sumMoney(leases.map((g) => g.periodicAmount), asset.currency);
  const occupiedUnitIds = new Set(leases.map((g) => g.unitId));
  const vacantUnits = units.filter((u) => !occupiedUnitIds.has(u.id));
  const purchase = typeof asset.details.purchasePrice === "number" ? asset.details.purchasePrice : undefined;
  /** Rentabilité brute annuelle, en pour mille entiers pour éviter les floats (74 → 7,4 %). */
  const grossYieldPermille = purchase && monthlyRent.amount > 0 ? Math.round((monthlyRent.amount * 12 * 1000) / purchase) : undefined;
  return { units, leases, monthlyRent, grossYieldPermille, occupied: leases.length > 0, vacantUnits, occupiedUnitIds };
}

export const formatPermille = (p: number) => `${Math.floor(p / 10)},${p % 10} %`;

export function yearFinance(s: OwnerState, assetId: string, year: number, currency: Currency) {
  const tx = s.transactions.filter((t) => t.assetId === assetId && t.occurredAt.startsWith(String(year)) && t.amount.currency === currency);
  const income = sumMoney(tx.filter((t) => t.direction === "IN").map((t) => t.amount), currency);
  const expenses = sumMoney(tx.filter((t) => t.direction === "OUT").map((t) => t.amount), currency);
  const byMonth = Array.from({ length: 12 }, (_, i) => {
    const m = `${year}-${String(i + 1).padStart(2, "0")}`;
    const inMonth = tx.filter((t) => t.occurredAt.startsWith(m));
    return inMonth.reduce((acc, t) => acc + (t.direction === "IN" ? t.amount.amount : -t.amount.amount), 0);
  });
  return { income, expenses, net: { amount: income.amount - expenses.amount, currency }, byMonth, transactions: tx };
}

export function leaseView(s: OwnerState, agreementId: string) {
  const g = s.agreements.find((a) => a.id === agreementId);
  if (!g) return null;
  const party = s.parties.find((p) => p.id === g.partyId);
  const asset = s.assets.find((a) => a.id === g.assetId);
  const unit = s.units.find((u) => u.id === g.unitId);
  const items = s.schedule.filter((it) => it.agreementId === g.id).sort((a, b) => b.dueDate.localeCompare(a.dueDate));
  return { agreement: g, party, asset, unit, items };
}

export type NotificationItem = { id: string; at: string; tone: "paid" | "late" | "danger"; title: string; body: string; href: string };

/** Fil de notifications, dérivé des données (côté API : push + SMS de secours). */
export function notificationFeed(s: OwnerState, now: string, autoReminders: boolean): NotificationItem[] {
  const since = new Date(Date.parse(now) - 30 * 86_400_000).toISOString();
  const out: NotificationItem[] = [];
  for (const t of s.transactions) {
    if (t.direction !== "IN" || t.occurredAt < since || t.occurredAt > now) continue;
    const item = s.schedule.find((it) => it.id === t.scheduleItemId);
    const g = item && s.agreements.find((a) => a.id === item.agreementId);
    const who = g ? partyName(s, g.partyId) : "";
    out.push({
      id: `n-${t.id}`,
      at: t.occurredAt,
      tone: "paid",
      title: "Loyer reçu",
      body: `${formatMoney(t.amount)}${who ? `, de ${who}` : ""}.`,
      href: g ? `/bail/${g.id}` : `/bien/${t.assetId}`,
    });
  }
  const today = now.slice(0, 10);
  for (const it of s.schedule) {
    if (it.status !== "LATE" && it.status !== "UNPAID" && it.status !== "PARTIAL") continue;
    const g = s.agreements.find((a) => a.id === it.agreementId);
    const asset = g && s.assets.find((a) => a.id === g.assetId);
    if (!g || !asset) continue;
    const days = Math.max(1, daysBetween(it.dueDate, today));
    out.push({
      id: `n-late-${it.id}`,
      at: `${it.dueDate}T08:00:00.000Z`,
      tone: "late",
      title: "Loyer en retard",
      body: `Le loyer de ${asset.name} a ${days} jour${days > 1 ? "s" : ""} de retard.${autoReminders ? " Nous avons relancé le locataire." : ""}`,
      href: `/bail/${g.id}`,
    });
  }
  for (const e of s.events) {
    if (!isOpenEvent(e)) continue;
    const asset = s.assets.find((a) => a.id === e.assetId);
    const urgency = e.urgency === "HIGH" ? "Urgence haute" : e.urgency === "MEDIUM" ? "Urgence moyenne" : "Peu urgent";
    out.push({
      id: `n-${e.id}`,
      at: e.reportedAt,
      tone: "danger",
      title: `${e.title} signalée`,
      body: `${asset?.name ?? ""}. ${urgency}.${e.quotes.length && e.status === "QUOTES_PENDING" ? " Des devis vous attendent." : ""}`,
      href: `/incident/${e.id}`,
    });
  }
  return out.sort((a, b) => b.at.localeCompare(a.at));
}

export type SearchHit = { id: string; kind: "asset" | "party"; title: string; subtitle: string; href: string };

export function search(s: OwnerState, query: string): SearchHit[] {
  const n = (x: string) => x.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const q = n(query.trim());
  if (q.length < 2) return [];
  const hits: SearchHit[] = [];
  for (const a of s.assets)
    if (n(`${a.name} ${a.location.address} ${a.location.city}`).includes(q))
      hits.push({ id: a.id, kind: "asset", title: a.name, subtitle: a.location.address, href: `/bien/${a.id}` });
  for (const p of s.parties) {
    if (!n(`${p.firstName} ${p.lastName} ${p.phone}`).includes(q)) continue;
    if (p.role === "FAMILY") {
      hits.push({ id: p.id, kind: "party", title: `${p.firstName} ${p.lastName}`, subtitle: `Famille${p.relation ? `, ${p.relation.toLowerCase()}` : ""}`, href: `/famille/${p.id}` });
      continue;
    }
    if (p.role !== "OCCUPANT") continue;
    const g = s.agreements.find((x) => x.partyId === p.id);
    const asset = g && s.assets.find((a) => a.id === g.assetId);
    hits.push({ id: p.id, kind: "party", title: `${p.firstName} ${p.lastName}`, subtitle: asset ? `Locataire, ${asset.name}` : "Locataire", href: g ? `/bail/${g.id}` : "/" });
  }
  return hits;
}

/** Contrôle de gestion (l'« ops » de Keyo), calculé sur les données du téléphone. */
export function auditReport(s: OwnerState, on: string) {
  return runAudit({ ...s, today: on });
}

/** Détenteur du patrimoine : le propriétaire du compte ou un proche invité. */
export type FamilyHolder = {
  id: string;
  name: string;
  relation: string;
  status: "OWNER" | "JOINED" | "INVITED";
  access?: "VIEW" | "MANAGE";
  party?: Party;
  patrimony: Patrimony;
};

export const familyMembers = (s: OwnerState) => s.parties.filter((p) => p.role === "FAMILY");
export const familyAssets = (s: OwnerState) => s.assets.filter((a) => a.holding === "FAMILY");

export function familyHolders(s: OwnerState, owner: { id: string; name: string }): FamilyHolder[] {
  return [
    { id: owner.id, name: owner.name, relation: "Vous", status: "OWNER" as const, patrimony: holderPatrimony(s.assets, s.shares, owner.id) },
    ...familyMembers(s).map((p) => ({
      id: p.id,
      name: `${p.firstName} ${p.lastName}`.trim(),
      relation: p.relation ?? "Proche",
      status: p.joinedAt ? ("JOINED" as const) : ("INVITED" as const),
      access: p.access,
      party: p,
      patrimony: holderPatrimony(s.assets, s.shares, p.id),
    })),
  ];
}

export const portfolioValue = (s: OwnerState) => totalPatrimony(s.assets);

/** Noms des détenteurs d'un bien, avec leur part. */
export function assetHolders(s: OwnerState, assetId: string, owner: { id: string; name: string }) {
  const asset = s.assets.find((a) => a.id === assetId);
  if (!asset) return [];
  return sharesOf(asset, s.shares).map((h) => ({ ...h, name: h.holderId === owner.id ? owner.name : partyName(s, h.holderId) }));
}

/**
 * Ce qu'un proche voit de chacun de ses biens : sa part, l'occupation, l'encaissement du mois,
 * les incidents et les points du contrôle de gestion. Lecture seule, sans données personnelles des occupants.
 */
export function memberDigest(s: OwnerState, holderId: string, month: string, on: string) {
  const audit = runAudit({ ...s, today: on });
  const lines = rentLines(s, month, on);
  return holderPatrimony(s.assets, s.shares, holderId).lines.map((l) => {
    const asset = s.assets.find((a) => a.id === l.assetId)!;
    const summary = assetSummary(s, asset, on);
    const mine = lines.filter((r) => r.assetId === asset.id);
    return {
      asset,
      sharePermille: l.sharePermille,
      value: l.value,
      part: l.part,
      units: summary.units.length,
      occupied: summary.units.length - summary.vacantUnits.length,
      expected: sumMoney(mine.map((r) => r.expected), asset.currency),
      received: sumMoney(mine.map((r) => r.received), asset.currency),
      late: mine.filter((r) => r.status === "LATE" || r.status === "UNPAID" || r.status === "PARTIAL").length,
      incidents: s.events.filter((e) => e.assetId === asset.id && isOpenEvent(e)).length,
      findings: audit.findings.filter((f) => f.assetId === asset.id).length,
    };
  });
}
