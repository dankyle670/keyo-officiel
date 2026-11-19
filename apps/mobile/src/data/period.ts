import { TODAY } from "./mock";

/** Date du jour. Figée sur la date des maquettes tant que les données sont fictives. */
export const today = () => TODAY;
export const currentMonth = () => TODAY.slice(0, 7);

const MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
const DAYS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];

export const monthName = (month: string) => MONTHS[Number(month.slice(5, 7)) - 1] ?? "";
export const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** « 12 août », « octobre 2025 ». Heure d'Abidjan = UTC. */
export const dayMonth = (iso: string) => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]}`;
export const monthYear = (iso: string) => `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;

/** « Demain à 9 h », « jeudi à 14 h », « il y a 2 h », « depuis lundi ». */
export function slotLabel(iso: string, now: string): string {
  const d = new Date(iso);
  const n = new Date(now);
  const dayDiff = Math.round((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate())) / 86_400_000);
  const hour = `${d.getUTCHours()} h${d.getUTCMinutes() ? String(d.getUTCMinutes()).padStart(2, "0") : ""}`;
  if (dayDiff === 0) return `Aujourd'hui à ${hour}`;
  if (dayDiff === 1) return `Demain à ${hour}`;
  if (dayDiff > 1 && dayDiff < 7) return `${capitalize(DAYS[d.getUTCDay()]!)} à ${hour}`;
  return `${dayMonth(iso)} à ${hour}`;
}

export function sinceLabel(iso: string, now: string): string {
  const diffH = Math.floor((Date.parse(now) - Date.parse(iso)) / 3_600_000);
  if (diffH < 1) return "à l'instant";
  if (diffH < 24) return `il y a ${diffH} h`;
  const d = new Date(iso);
  if (diffH < 24 * 7) return `depuis ${DAYS[d.getUTCDay()]}`;
  return `le ${dayMonth(iso)}`;
}
