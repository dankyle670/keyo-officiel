import { capabilities, NEVER_DOES, SPECIALIST_LABEL, type AutonomousAction, type AutonomyLevel } from "@keyo/shared";
import { autonomousApi } from "@/autonomous/api";
import { syncNow } from "@/autonomous/sync";
import type { DemoReply } from "./demo";

/**
 * Mode démo : demandes sur ce que Keyo fait en l'absence du propriétaire (journal, accords,
 * autonomie, passage immédiat). Les modifications passent par la même carte de confirmation.
 */
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

const ACTION_WORDS: [RegExp, AutonomousAction][] = [
  [/quittance/, "send_receipt"],
  [/lien de paiement/, "send_payment_link"],
  [/relanc/, "send_rent_reminder"],
  [/devis/, "approve_quote"],
  [/incident|panne/, "triage_incident"],
  [/annonce/, "publish_listing"],
  [/visite/, "schedule_visit"],
  [/rapport/, "send_monthly_report"],
  [/piece|document manquant/, "request_missing_document"],
];

const LINK = { label: "Ouvrir ce que Keyo a fait", href: "/agent" };

const STATUS_NOTE = { READY: "", READY_SIMULATED: " (prête, en attente du connecteur)", ASKS_YOU: " (avec votre accord)", OFF: " (désactivée)" } as const;

/** « Que sais-tu faire ? » : tout le catalogue, avec le statut réel de chaque action. */
async function capabilitiesReply(): Promise<DemoReply> {
  const [connectors, policy] = await Promise.all([autonomousApi.connectors().catch(() => []), autonomousApi.policy().catch(() => undefined)]);
  const groups = capabilities(connectors.filter((c) => !c.simulated).map((c) => c.channel), policy);
  const body = groups.map((g) => `${g.domain}\n${g.actions.map((a) => `- ${a.what}${a.mode === "Seul" ? ", seul" : ""}${STATUS_NOTE[a.status]}`).join("\n")}`).join("\n\n");
  return {
    text: `Voici tout ce que je sais faire pour vous, sur demande dans ce chat ou seul en votre absence :\n\n${body}\n\nJe ne ferai jamais : ${NEVER_DOES.join(", ")}.\n\nPar quel domaine voulez-vous commencer ?\nSources : catalogue de l'agent Keyo`,
    link: { label: "Régler mon autonomie", href: "/agent/autonomie" },
  };
}

export async function demoAutonomyReply(question: string): Promise<DemoReply | null> {
  const q = norm(question);
  if (/(que (sais|peux|pouvez|savez)|quelles? actions?|tu sers a quoi|a quoi (tu sers|servez)|tes (fonctions|capacites)|qu.?est.?ce que tu (sais|peux))/.test(q)) return capabilitiesReply();
  const about = /(keyo|agent|autonom|en mon absence|sans moi|tout seul|seul\b|journal|attente|a valider|accord|plafond|pause)/.test(q);
  if (!about) return null;

  // Réglages : interrupteur, niveau d'une action, plafond.
  if (/(pause|arrete d.?agir|desactive|ne fais plus rien|stop)/.test(q)) return { text: "Je me mets en pause : je ne ferai plus rien de moi-même tant que vous ne me relancez pas.", proposal: { name: "set_autonomy", input: { enabled: false } } };
  if (/(reactive|reprends|laisse.*agir|remets.*en route)/.test(q)) return { text: "Je reprends le travail en votre absence, selon vos réglages.", proposal: { name: "set_autonomy", input: { enabled: true } } };
  const cap = q.match(/plafond[^\d]*([\d\s.]{3,})/);
  if (cap) {
    const amount = Number(cap[1]!.replace(/[^\d]/g, ""));
    if (amount > 0) return { text: "Je change le plafond des dépenses que je peux engager sans vous.", proposal: { name: "set_autonomy", input: { spendCap: amount } } };
  }
  const target = ACTION_WORDS.find(([re]) => re.test(q))?.[1];
  const level: AutonomyLevel | undefined = /(demande|consulte|previens.*avant|avant de)/.test(q) ? "ASK" : /(previens|informe|dis.?moi apres)/.test(q) ? "NOTIFY" : /(seul|automatique|sans me demander)/.test(q) ? "AUTO" : /(ne .*plus|jamais|interdi)/.test(q) ? "OFF" : undefined;
  if (target && level) return { text: "Je mets à jour ce que je peux faire seul.", proposal: { name: "set_autonomy", input: { action: target, level } } };

  // Passage immédiat.
  if (/(lance|fais|passe|tourne).*(passage|tournee|maintenant)|lance l.?agent/.test(q)) return { text: "Je fais un passage maintenant : relances, quittances, incidents et échéances, selon vos réglages.", proposal: { name: "run_autonomous_pass", input: {} } };

  try {
    await syncNow();
    const journal = await autonomousApi.journal();
    const pending = journal.filter((e) => e.status === "PENDING_APPROVAL");

    if (pending.length && /(valide|accepte|approuve|ok pour|d.?accord)/.test(q)) {
      return { text: `Je valide : ${pending[0]!.summary}.`, proposal: { name: "decide_pending_action", input: { actionId: pending[0]!.id, decision: "APPROVE" } }, link: LINK };
    }
    if (pending.length && /(refuse|rejette|annule la demande)/.test(q)) {
      return { text: `Je refuse : ${pending[0]!.summary}.`, proposal: { name: "decide_pending_action", input: { actionId: pending[0]!.id, decision: "REJECT" } }, link: LINK };
    }

    const done = journal.filter((e) => e.status === "DONE").slice(0, 4);
    const lines = [
      done.length ? `Ce que j'ai fait récemment :\n${done.map((e) => `- ${e.summary}`).join("\n")}` : "Je n'ai encore rien fait en votre absence.",
      pending.length
        ? `${pending.length} demande${pending.length > 1 ? "s attendent" : " attend"} votre accord :\n${pending.slice(0, 3).map((e) => `- ${e.summary} (${SPECIALIST_LABEL[e.specialist]})`).join("\n")}\nDites « valide » ou « refuse » pour la première, ou ouvrez le journal.`
        : "Rien n'attend votre accord.",
    ];
    return { text: `${lines.join("\n\n")}\nSources : journal de Keyo`, link: LINK };
  } catch (e) {
    return { text: `${e instanceof Error ? e.message : "Serveur Keyo injoignable."} Je ne peux pas consulter ce que j'ai fait en votre absence pour l'instant.` };
  }
}
