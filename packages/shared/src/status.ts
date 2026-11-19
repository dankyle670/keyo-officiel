import type { DueStatus } from "./domain.ts";

/** Ton visuel d'un statut. Un statut porte toujours un mot en plus de la couleur. */
export type StatusTone = "paid" | "late" | "danger" | "info" | "neutral";

export const DUE_STATUS_TONE: Record<DueStatus, StatusTone> = {
  PAID: "paid",
  UPCOMING: "neutral",
  LATE: "late",
  PARTIAL: "late",
  UNPAID: "danger",
};

export function daysLateLabel(days: number): string {
  if (days <= 0) return "À jour";
  return days === 1 ? "1 jour de retard" : `${days} jours de retard`;
}

export function daysBetween(fromIso: string, toIso: string): number {
  const ms = Date.parse(toIso) - Date.parse(fromIso);
  return Math.floor(ms / 86_400_000);
}
