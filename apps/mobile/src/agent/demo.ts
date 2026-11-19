import { AUDIT_AREA_LABEL, formatMoney, type Currency } from "@keyo/shared";
import { answer } from "@/data/assistant";
import { addDays, currentMonth, monthName, today } from "@/data/period";
import { auditReport, monthSummary } from "@/data/selectors";
import { getOwnerState } from "@/data/store";

/**
 * Mode démo de l'agent, sans IA : utilisé tant que le serveur n'a pas de clé Claude (ou est
 * injoignable). Il reconnaît quelques demandes courantes et passe par les mêmes outils et la même
 * carte de confirmation que le vrai agent.
 */
export type DemoReply = { text: string; proposal?: { name: string; input: Record<string, unknown> } };

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

function findAsset(q: string) {
  return getOwnerState().assets.find((a) => norm(a.name).split(/[\s.]+/).some((w) => w.length > 3 && q.includes(w)));
}

/** « 45 000 », « 45000 FCFA », « 45k » → 45000 (FCFA) ; « 45,50 € » → 4550 (centimes). */
function findAmount(q: string, currency: Currency): number | undefined {
  const m = q.match(/(\d[\d\s.]*)(?:,(\d{1,2}))?\s*(k|mille)?/);
  if (!m) return undefined;
  let units = Number(m[1]!.replace(/[\s.]/g, ""));
  if (m[3]) units *= 1000;
  if (!units) return undefined;
  return currency === "XOF" ? units : units * 100 + Number((m[2] ?? "0").padEnd(2, "0"));
}

export function demoReply(question: string, currency: Currency): DemoReply {
  const q = norm(question);
  const s = getOwnerState();
  if (s.assets.length === 0) return { text: "Vous n'avez encore aucun bien. Ajoutez-en un depuis l'onglet Biens, ou chargez les données de démonstration dans le Profil." };

  if (/(en ordre|controle|manque|fiscal|impot|document|conform|verifi)/.test(q)) {
    const r = auditReport(s, today());
    if (!r.findings.length) return { text: "Tout est en ordre : aucune pièce manquante, aucun retard, aucun point en attente.\nSources : contrôle de gestion" };
    const top = r.findings.slice(0, 3).map((f) => `- ${AUDIT_AREA_LABEL[f.area]} : ${f.title}. ${f.detail}`);
    return {
      text: `Score de gestion : ${r.score} sur 100, ${r.findings.length} point${r.findings.length > 1 ? "s" : ""} à traiter. Les plus importants :\n${top.join("\n")}\nLe détail est dans l'écran Contrôle.\nSources : contrôle de gestion`,
    };
  }

  if (/rapport/.test(q)) {
    const sum = monthSummary(s, currentMonth(), today(), currency);
    const got = sum.lines.reduce((a, l) => a + l.received.amount, 0);
    const exp = sum.lines.reduce((a, l) => a + l.expected.amount, 0);
    const open = s.events.filter((e) => e.status !== "RESOLVED").length;
    return {
      text: `Rapport de ${monthName(currentMonth())} : ${formatMoney({ amount: got, currency })} encaissés sur ${formatMoney({ amount: exp, currency })} attendus. ${sum.late.length} retard${sum.late.length > 1 ? "s" : ""}, ${open} incident${open > 1 ? "s" : ""} ouvert${open > 1 ? "s" : ""}.\nSources : loyers et incidents du mois`,
    };
  }

  if (/relanc/.test(q)) {
    const late = monthSummary(s, currentMonth(), today(), currency).late;
    const target = late.find((l) => q.includes(norm(l.partyName.split(" ")[0]!))) ?? late[0];
    if (!target) return { text: "Aucun loyer en retard ce mois-ci : pas de relance à envoyer." };
    return { text: `${target.partyName} a ${target.daysLate} jours de retard. Je prépare une relance courtoise.`, proposal: { name: "send_reminder", input: { agreementId: target.agreementId, tone: target.daysLate > 10 ? "FIRM" : "COURTEOUS" } } };
  }

  if (/depense|facture|paye pour/.test(q) && /\d/.test(q)) {
    const asset = findAsset(q);
    const amount = findAmount(q, currency);
    if (!asset || !amount) return { text: "Pour enregistrer une dépense, précisez le montant et le bien, par exemple : « Ajoute une dépense de 45 000 pour la plomberie à Bingerville »." };
    return {
      text: "Je prépare la dépense.",
      proposal: { name: "add_expense", input: { assetId: asset.id, label: question.replace(/^.*?(pour|:)\s*/i, "").slice(0, 60) || "Dépense", category: /plomb|fuite|repar/.test(q) ? "REPAIR" : "OTHER", amount, currency: asset.currency } },
    };
  }

  if (/devis|fuite|plomb|electri|clim|serrur/.test(q) && !/entretien/.test(q)) {
    const asset = findAsset(q) ?? s.assets[0]!;
    const category = /plomb|fuite/.test(q) ? "PLUMBING" : /electri/.test(q) ? "ELECTRICITY" : /clim/.test(q) ? "AIR_CONDITIONING" : /serrur/.test(q) ? "LOCKSMITH" : "OTHER";
    return {
      text: `Je demande trois devis à des artisans notés pour ${asset.name}.`,
      proposal: { name: "request_quotes", input: { assetId: asset.id, title: question.slice(0, 60), description: question, category, urgency: /urgent|fuite/.test(q) ? "HIGH" : "MEDIUM" } },
    };
  }

  if (/entretien|vidange|fosse|peinture/.test(q)) {
    const asset = findAsset(q) ?? s.assets[0]!;
    const label = /clim/.test(q) ? "Entretien de la climatisation" : /fosse|vidange/.test(q) ? "Vidange de la fosse septique" : /peinture/.test(q) ? "Peinture" : "Entretien préventif";
    const every = /clim/.test(q) ? 6 : /fosse|vidange/.test(q) ? 24 : 12;
    return { text: `Je programme « ${label} » à ${asset.name}.`, proposal: { name: "schedule_maintenance", input: { assetId: asset.id, label, everyMonths: every, nextDueOn: addDays(today(), 14) } } };
  }

  if (/gerant|visite|mission|etat des lieux|cles/.test(q)) {
    const asset = findAsset(q) ?? s.assets[0]!;
    const kind = /etat des lieux|controle/.test(q) ? "INSPECTION" : /cles/.test(q) ? "KEY_HANDOVER" : "VISIT";
    return { text: `Je confie la mission au gérant terrain pour ${asset.name}.`, proposal: { name: "assign_mission", input: { assetId: asset.id, kind, title: question.slice(0, 60), dueDate: addDays(today(), 3) } } };
  }

  const a = answer(s, question, currency);
  const lines = [a.lead, a.amount ? formatMoney(a.amount.value) + (a.amount.suffix ? ` ${a.amount.suffix}` : "") : "", a.note ?? ""].filter(Boolean);
  if (a.sources.length) lines.push(`Sources : ${a.sources.join(", ")}`);
  return { text: lines.join("\n") };
}
