/** Date et heure courantes. Fuseau d'Abidjan = UTC, utilisé pour tous les calculs d'échéance. */
export const nowIso = () => new Date().toISOString();
export const today = () => nowIso().slice(0, 10);
export const currentMonth = () => today().slice(0, 7);

const MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
const DAYS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];

export const monthName = (month: string) => MONTHS[Number(month.slice(5, 7)) - 1] ?? "";
export const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** « 12 août », « octobre 2025 », « 12 août 2026 ». */
export const dayMonth = (iso: string) => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]}`;
export const monthYear = (iso: string) => `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
export const fullDate = (iso: string) => `${dayMonth(iso)} ${iso.slice(0, 4)}`;

/** « Demain à 9 h », « Jeudi à 14 h ». */
export function slotLabel(iso: string, now: string = nowIso()): string {
  const d = new Date(iso);
  const n = new Date(now);
  const dayDiff = Math.round((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate())) / 86_400_000);
  const hour = `${d.getUTCHours()} h${d.getUTCMinutes() ? String(d.getUTCMinutes()).padStart(2, "0") : ""}`;
  if (dayDiff === 0) return `Aujourd'hui à ${hour}`;
  if (dayDiff === 1) return `Demain à ${hour}`;
  if (dayDiff > 1 && dayDiff < 7) return `${capitalize(DAYS[d.getUTCDay()]!)} à ${hour}`;
  return `${dayMonth(iso)} à ${hour}`;
}

/** « à l'instant », « il y a 2 h », « depuis lundi », « le 12 août ». */
export function sinceLabel(iso: string, now: string = nowIso()): string {
  const diffMin = Math.floor((Date.parse(now) - Date.parse(iso)) / 60_000);
  if (diffMin < 1) return "à l'instant";
  if (diffMin < 60) return `il y a ${diffMin} min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `il y a ${diffH} h`;
  if (diffH < 24 * 7) return `depuis ${DAYS[new Date(iso).getUTCDay()]}`;
  return `le ${dayMonth(iso)}`;
}

export const timeLabel = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
};

/** Décale une date-heure ISO d'un nombre d'heures. */
export const shiftHours = (iso: string, h: number) => new Date(Date.parse(iso) + h * 3_600_000).toISOString();
export const atHour = (isoDate: string, h: number) => `${isoDate}T${String(h).padStart(2, "0")}:00:00.000Z`;
export const addDays = (isoDate: string, n: number) => new Date(Date.parse(isoDate) + n * 86_400_000).toISOString().slice(0, 10);
