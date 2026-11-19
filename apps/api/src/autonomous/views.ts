import { formatMoney, runAudit, type Asset, type Money } from "@keyo/shared";
import type { OwnerSnapshot } from "./store.ts";

/** Lectures déterministes des données du propriétaire, partagées par les agents et les règles fixes. */

const TZ: Record<string, string> = { CI: "Africa/Abidjan", SN: "Africa/Dakar", FR: "Europe/Paris", CA: "America/Toronto", US: "America/New_York", BE: "Europe/Brussels" };

/** Heure locale du bien (0 à 23) : les heures calmes s'appliquent là où vit l'occupant. */
export function localHour(asset: Asset | undefined, at: Date): number {
  const timeZone = TZ[asset?.location.country ?? "CI"] ?? "Africa/Abidjan";
  return Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hourCycle: "h23", timeZone }).format(at));
}

const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);

export function dueContext(s: OwnerSnapshot, scheduleItemId: string) {
  const item = s.schedule.find((i) => i.id === scheduleItemId);
  const agreement = item && s.agreements.find((g) => g.id === item.agreementId);
  const party = agreement && s.parties.find((p) => p.id === agreement.partyId);
  const unit = agreement && s.units.find((u) => u.id === agreement.unitId);
  const asset = agreement && s.assets.find((a) => a.id === agreement.assetId);
  return { item, agreement, party, unit, asset };
}

export const remaining = (expected: Money, received: Money): Money => ({ amount: Math.max(0, expected.amount - received.amount), currency: expected.currency });

export function overdueRents(s: OwnerSnapshot, today: string) {
  return s.schedule
    .filter((i) => (i.status === "LATE" || i.status === "PARTIAL" || i.status === "UNPAID") && i.dueDate <= today)
    .map((i) => {
      const { party, unit, asset } = dueContext(s, i.id);
      return {
        scheduleItemId: i.id,
        occupant: party ? `${party.firstName} ${party.lastName}` : "Inconnu",
        unit: unit?.label,
        asset: asset?.name,
        dueDate: i.dueDate,
        daysLate: daysBetween(i.dueDate, today),
        due: formatMoney(remaining(i.expected, i.received)),
        status: i.status,
      };
    })
    .sort((a, b) => b.daysLate - a.daysLate);
}

export function recentlyPaid(s: OwnerSnapshot, today: string, days = 31) {
  return s.schedule
    .filter((i) => i.status === "PAID" && daysBetween(i.dueDate, today) <= days && i.dueDate <= today)
    .map((i) => {
      const { party, asset } = dueContext(s, i.id);
      return { scheduleItemId: i.id, occupant: party ? `${party.firstName} ${party.lastName}` : "Inconnu", asset: asset?.name, dueDate: i.dueDate, amount: formatMoney(i.received) };
    });
}

export function vacantUnits(s: OwnerSnapshot, today: string) {
  const occupied = new Set(s.agreements.filter((g) => g.startDate <= today && (!g.endDate || g.endDate >= today)).map((g) => g.unitId));
  return s.units
    .filter((u) => !occupied.has(u.id))
    .map((u) => ({ unitId: u.id, unit: u.label, asset: s.assets.find((a) => a.id === u.assetId)?.name, details: u.details }));
}

export function endingAgreements(s: OwnerSnapshot, today: string, within = 60) {
  return s.agreements
    .filter((g) => g.endDate && g.endDate >= today && daysBetween(today, g.endDate) <= within)
    .map((g) => ({ agreementId: g.id, unit: s.units.find((u) => u.id === g.unitId)?.label, endDate: g.endDate, daysLeft: daysBetween(today, g.endDate!) }));
}

export function openIncidents(s: OwnerSnapshot) {
  return s.events
    .filter((e) => e.status !== "RESOLVED" && (e.kind === "INCIDENT" || e.kind === "BREAKDOWN"))
    .map((e) => ({
      eventId: e.id,
      title: e.title,
      description: e.description,
      urgency: e.urgency,
      status: e.status,
      triaged: Boolean(e.aiSummary),
      asset: s.assets.find((a) => a.id === e.assetId)?.name,
      quotes: e.quotes.map((q) => ({ quoteId: q.id, provider: q.provider, rating: q.rating, slot: q.slot, amount: formatMoney(q.amount) })),
    }));
}

export const craftsmen = (s: OwnerSnapshot) => s.parties.filter((p) => p.role === "CRAFTSMAN").map((p) => ({ partyId: p.id, name: `${p.firstName} ${p.lastName}` }));

export function complianceFindings(s: OwnerSnapshot, today: string) {
  const r = runAudit({ ...s, today });
  return { score: r.score, findings: r.findings.map((f) => ({ id: f.id, severity: f.severity, area: f.area, title: f.title, detail: f.detail })) };
}

export function monthSummary(s: OwnerSnapshot, month: string) {
  const items = s.schedule.filter((i) => i.dueDate.startsWith(month) && i.expected.currency === s.currency);
  const sum = (xs: number[]) => xs.reduce((n, x) => n + x, 0);
  const expenses = s.transactions.filter((t) => t.direction === "OUT" && t.occurredAt.startsWith(month) && t.amount.currency === s.currency);
  return {
    month,
    expected: formatMoney({ amount: sum(items.map((i) => i.expected.amount)), currency: s.currency }),
    received: formatMoney({ amount: sum(items.map((i) => i.received.amount)), currency: s.currency }),
    late: items.filter((i) => i.status !== "PAID" && i.status !== "UPCOMING").length,
    expenses: formatMoney({ amount: sum(expenses.map((t) => t.amount.amount)), currency: s.currency }),
    openIncidents: openIncidents(s).length,
  };
}
