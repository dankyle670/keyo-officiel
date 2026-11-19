import { formatMoney, sumMoney, type Money } from "@keyo/shared";
import { currentMonth, monthName, today } from "./period";
import { assetSummary, formatPermille, monthSummary, yearFinance } from "./selectors";
import type { OwnerState } from "./store";

export type AssistantAnswer = {
  lead: string;
  amount?: { value: Money; suffix: string };
  /** Série mensuelle (unités mineures), pour le graphique. */
  series?: number[];
  note?: string;
  /** Biens ou données utilisés : l'assistant affiche toujours ses sources. */
  sources: string[];
};

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/**
 * Réponses calculées localement à partir des données du propriétaire, en attendant l'assistant
 * IA de la Phase 2 (API Claude appelée depuis apps/api, jamais depuis l'app, limitée aux données
 * du propriétaire, avec sources affichées).
 */
export function answer(s: OwnerState, question: string, currency: "XOF" | "EUR"): AssistantAnswer {
  const q = norm(question);
  const year = Number(today().slice(0, 4));
  const asset = s.assets.find((a) => q.includes(norm(a.name).split(" ").slice(-1)[0]!));

  if (asset && /(rapporte|gagne|revenu|rentab)/.test(q)) {
    const f = yearFinance(s, asset.id, year, currency);
    const months = f.byMonth.slice(0, Number(today().slice(5, 7)));
    const lows = months.map((v, i) => ({ v, i })).filter(({ v }) => v < Math.max(...months));
    const expense = f.transactions.find((t) => t.direction === "OUT");
    return {
      lead: `Depuis janvier, ${asset.name.split(" ")[0]!.toLowerCase() === "villa" ? "la villa" : asset.name} vous a rapporté`,
      amount: { value: f.net, suffix: "nets" },
      series: months,
      note:
        lows.length === 1 && expense
          ? `Un seul creux en ${monthName(`${year}-${String(lows[0]!.i + 1).padStart(2, "0")}`)} : ${expense.label.toLowerCase()} de ${formatMoney(expense.amount)}.`
          : lows.length === 0
            ? "Aucun mois en baisse."
            : `${lows.length} mois en baisse, à cause de dépenses.`,
      sources: [asset.name, `Encaissements et dépenses ${year}`],
    };
  }

  if (/retard/.test(q)) {
    const late = monthSummary(s, currentMonth(), today(), currency).late;
    if (late.length === 0) return { lead: "Aucun loyer en retard ce mois-ci.", sources: ["Loyers du mois"] };
    return {
      lead: late.map((l) => `${l.partyName} (${l.assetName}), ${l.daysLate} jours de retard ce mois-ci.`).join("\n"),
      note: "Les relances automatiques partent à J+1, J+5 et J+10.",
      sources: ["Loyers du mois"],
    };
  }

  if (/depense/.test(q)) {
    const m = currentMonth();
    const out = s.transactions.filter((t) => t.direction === "OUT" && t.occurredAt.startsWith(m) && t.amount.currency === currency);
    return {
      lead: out.length ? `Ce mois-ci, ${out.length} dépense${out.length > 1 ? "s" : ""} pour un total de` : `Aucune dépense enregistrée en ${monthName(m)}.`,
      amount: out.length ? { value: sumMoney(out.map((t) => t.amount), currency), suffix: "" } : undefined,
      sources: ["Dépenses du mois"],
    };
  }

  if (/compar/.test(q)) {
    const lines = s.assets
      .map((a) => ({ a, sum: assetSummary(s, a) }))
      .sort((x, y) => (y.sum.grossYieldPermille ?? 0) - (x.sum.grossYieldPermille ?? 0))
      .map(({ a, sum }) => `${a.name} : ${formatMoney(sum.monthlyRent)} par mois${sum.grossYieldPermille ? `, ${formatPermille(sum.grossYieldPermille)} brut` : ""}`);
    return { lead: lines.join("\n"), note: "Classés par rentabilité brute.", sources: s.assets.map((a) => a.name) };
  }

  return {
    lead: "Je ne sais pas encore répondre à cette question. Essayez une des suggestions ci-dessous.",
    sources: [],
  };
}

export const SUGGESTIONS = ["Qui paie souvent en retard ?", "Mes dépenses ce mois", "Comparer mes biens"];
export const FIRST_QUESTION = "Combien m'a rapporté la villa de Bingerville cette année ?";
