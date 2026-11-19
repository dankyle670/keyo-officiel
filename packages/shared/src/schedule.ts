import type { Agreement, DueStatus, ScheduleItem } from "./domain.ts";
import type { Money } from "./money.ts";

/** Date ISO (AAAA-MM-JJ) du jour d'échéance pour un mois « AAAA-MM ». */
export const dueDateFor = (month: string, dueDay: number) => `${month}-${String(dueDay).padStart(2, "0")}`;

export function addMonths(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const idx = y * 12 + (m - 1) + n;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}`;
}

export function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let m = from; m <= to; m = addMonths(m, 1)) out.push(m);
  return out;
}

/**
 * Statut d'une échéance. Même règle que la tâche quotidienne du serveur :
 * payé si le reçu (confirmé par webhook) couvre l'attendu, partiel s'il en couvre une partie
 * après l'échéance, en retard si rien n'est reçu après l'échéance, impayé après 30 jours.
 */
export function dueStatus(expected: Money, received: Money, dueDate: string, today: string): DueStatus {
  if (received.amount >= expected.amount) return "PAID";
  if (today <= dueDate) return "UPCOMING";
  if (received.amount > 0) return "PARTIAL";
  const days = Math.floor((Date.parse(today) - Date.parse(dueDate)) / 86_400_000);
  return days > 30 ? "UNPAID" : "LATE";
}

/**
 * Échéancier mensuel d'un contrat, du mois de début jusqu'à `untilMonth` inclus
 * (borné par la date de fin). Les montants reçus partent à zéro : seuls les webhooks les modifient.
 */
export function buildMonthlySchedule(agreement: Agreement, untilMonth: string, today: string): ScheduleItem[] {
  if (agreement.period !== "MONTHLY") throw new Error(`Période non gérée : ${agreement.period}`);
  const start = agreement.startDate.slice(0, 7);
  const end = agreement.endDate && agreement.endDate.slice(0, 7) < untilMonth ? agreement.endDate.slice(0, 7) : untilMonth;
  return monthsBetween(start, end).map((month) => {
    // La première échéance ne précède jamais la signature : elle tombe au plus tôt le jour du début.
    const nominal = dueDateFor(month, agreement.dueDay);
    const dueDate = nominal < agreement.startDate ? agreement.startDate : nominal;
    const received = { amount: 0, currency: agreement.periodicAmount.currency };
    return {
      id: `s-${agreement.id}-${month}`,
      agreementId: agreement.id,
      dueDate,
      expected: agreement.periodicAmount,
      received,
      status: dueStatus(agreement.periodicAmount, received, dueDate, today),
    };
  });
}

/** Relances automatiques : J+1 (rappel courtois), J+5 (relance ferme), J+10 (dernier rappel). */
export const REMINDER_STEPS = [
  { offsetDays: 1, tone: "COURTEOUS", channel: "PUSH" },
  { offsetDays: 5, tone: "FIRM", channel: "PUSH_SMS" },
  { offsetDays: 10, tone: "FINAL", channel: "SMS" },
] as const;

export type ReminderTone = (typeof REMINDER_STEPS)[number]["tone"];

export function reminderPlan(dueDate: string, today: string) {
  return REMINDER_STEPS.map((step) => {
    const d = new Date(Date.parse(dueDate) + step.offsetDays * 86_400_000).toISOString().slice(0, 10);
    return { ...step, date: d, sent: d <= today };
  });
}
