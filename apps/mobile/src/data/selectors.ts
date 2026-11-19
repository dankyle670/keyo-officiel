import { daysBetween, sumMoney, type Asset, type AssetEvent, type Currency, type Money, type StatusTone } from "@keyo/shared";
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
  | { kind: "late"; id: string; title: string; subtitle: string; amount: Money; assetId: string }
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

export function assetSummary(s: OwnerState, asset: Asset) {
  const units = s.units.filter((u) => u.assetId === asset.id);
  const leases = s.agreements.filter((g) => g.assetId === asset.id && g.kind === "LEASE");
  const monthlyRent = sumMoney(leases.map((g) => g.periodicAmount), asset.currency);
  const purchase = typeof asset.details.purchasePrice === "number" ? asset.details.purchasePrice : undefined;
  /** Rentabilité brute annuelle, en pour mille entiers pour éviter les floats (74 → 7,4 %). */
  const grossYieldPermille = purchase ? Math.round((monthlyRent.amount * 12 * 1000) / purchase) : undefined;
  return { units, leases, monthlyRent, grossYieldPermille, occupied: leases.length > 0 };
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
