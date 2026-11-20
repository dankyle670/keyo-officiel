import { borrowingCapacity, PASSPORT_LEVEL_LABEL, appraisalKind, appraisalQuestions, AUDIT_AREA_LABEL, CONFIDENCE_LABEL, formatMoney, formatShare, type Currency } from "@keyo/shared";
import { answer } from "@/data/assistant";
import { addDays, currentMonth, monthName, today } from "@/data/period";
import { auditReport, familyHolders, latestAppraisal, monthSummary, passportOf, portfolioValue } from "@/data/selectors";
import { getSession } from "@/data/session";
import { getOwnerState } from "@/data/store";

/**
 * Mode démo de l'agent, sans IA : utilisé tant que le serveur n'a pas de clé Claude (ou est
 * injoignable). Il reconnaît quelques demandes courantes et passe par les mêmes outils et la même
 * carte de confirmation que le vrai agent.
 */
export type DemoReply = { text: string; proposal?: { name: string; input: Record<string, unknown> }; link?: { label: string; href: string } };

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

  // Évaluation : avant le contrôle, car « documents » apparaît souvent dans la demande.
  // L'expertise (maisons, appartements, immeubles, plantations) passe par l'entretien d'expert.
  if (/(evalu|estim|vaut|valeur|expertis)/.test(q)) {
    const one = findAsset(q);
    if (one) {
      if (!appraisalKind(one))
        return { text: `L'expertise de ${one.name} n'est pas encore disponible : Keyo évalue les maisons, les appartements, les immeubles et les plantations. Vous pouvez saisir sa valeur vous-même dans « Modifier le bien ».` };
      const last = latestAppraisal(s, one.id);
      const n = appraisalQuestions(one, s.units, s.agreements, today()).length;
      return {
        text: last
          ? `Dernière expertise de ${one.name} : ${formatMoney(last.result.value)}, entre ${formatMoney(last.result.low)} et ${formatMoney(last.result.high)} (${CONFIDENCE_LABEL[last.result.confidence].toLowerCase()}). Si quelque chose a changé (travaux, titre obtenu), refaisons l'entretien.\nSources : expertise Keyo`
          : `Pour estimer ${one.name} sérieusement, je vais vous poser ${n} questions, comme un expert venu sur place : ${appraisalKind(one) === "PLANTATION" ? "culture, surface, stade des plants, rendement, entretien, titre et accès" : appraisalKind(one) === "BUILDING" ? "quartier, usage, niveaux, surface, loyers, occupation, charges, état, titre, permis et accès" : "quartier, surface, âge, état, finitions, équipements, titre et accès"}. Comptez deux minutes.`,
        link: { label: last ? "Refaire l'expertise" : "Commencer l'expertise", href: `/bien/${one.id}/expertise` },
      };
    }
    const ok = s.assets.filter((a) => appraisalKind(a));
    const lines = ok.map((a) => {
      const last = latestAppraisal(s, a.id);
      return `- ${a.name} : ${last ? `${formatMoney(last.result.value)} (expertise du ${last.createdAt.slice(8, 10)}/${last.createdAt.slice(5, 7)})` : "pas encore expertisé"}`;
    });
    const next = ok.find((a) => !latestAppraisal(s, a.id));
    const others = s.assets.length - ok.length;
    return {
      text: `${ok.length ? `Biens que je peux expertiser :\n${lines.join("\n")}` : "Aucun de vos biens n'est encore expertisable."}${others ? `\n${others} autre${others > 1 ? "s" : ""} bien${others > 1 ? "s" : ""} (immeuble, local, véhicule…) : bientôt.` : ""}${next ? `\nCommençons par ${next.name} ?` : ""}\nSources : expertise Keyo`,
      link: next ? { label: `Expertiser ${next.name}`, href: `/bien/${next.id}/expertise` } : undefined,
    };
  }

  if (/(credit|emprunt|banque|passeport|pret|capacite)/.test(q)) {
    const ses = getSession();
    const uid = ses.status === "signedIn" ? ses.user.id : "owner";
    const p = passportOf(s, uid, currency, today());
    const b = borrowingCapacity({ passport: p, otherIncome: s.passport.otherIncome ?? 0, existingLoans: s.passport.existingLoans ?? 0, years: 15 });
    return {
      text: `Votre passeport propriétaire : ${p.score} sur 1000 (${PASSPORT_LEVEL_LABEL[p.level].toLowerCase()}).\n- Loyers certifiés sur 12 mois : ${formatMoney(p.certifiedIncome12m)}${p.expected12m.amount ? `, ${(p.collectionRatePermille / 10).toLocaleString("fr-FR")} % encaissés` : ""}\n- Capacité d'emprunt indicative sur 15 ans : ${formatMoney(b.capacity)}, mensualité jusqu'à ${formatMoney(b.maxInstallment)}${s.passport.otherIncome ? "" : " (loyers seuls : ajoutez vos autres revenus pour un calcul complet)"}\nCe n'est pas une offre de prêt : la banque décide.\nSources : passeport propriétaire`,
      link: { label: "Simuler un crédit", href: "/passeport/credit" },
    };
  }

  if (/(patrimoine|famille|part de|parts)/.test(q)) {
    const ses = getSession();
    const owner = ses.status === "signedIn" ? { id: ses.user.id, name: ses.user.firstName ?? "Vous" } : { id: "owner", name: "Vous" };
    const hs = familyHolders(s, owner).map((h) => `- ${h.name} (${h.relation.toLowerCase()}) : ${h.patrimony.totals.map(formatMoney).join(" + ") || "aucune part"}${h.status === "INVITED" ? ", invitation en attente" : ""}`);
    const fam = s.assets.filter((a) => a.holding === "FAMILY").map((a) => `${a.name} (${s.shares.filter((x) => x.assetId === a.id).map((x) => formatShare(x.sharePermille)).join(" / ")})`);
    return {
      text: `Patrimoine total : ${portfolioValue(s).map(formatMoney).join(" + ") || "non estimé"}.\nPart de chacun :\n${hs.join("\n")}\n${fam.length ? `Biens de famille : ${fam.join(", ")}.` : "Aucun bien de famille déclaré."}\nSources : famille et patrimoine`,
    };
  }

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

/** Mode démo : un document joint est proposé au classement, type deviné d'après son nom et le message. */
export function demoAttachmentReply(file: { id: string; name: string; kind: "image" | "pdf" }, message: string): DemoReply {
  const q = norm(`${file.name} ${message}`);
  const s = getOwnerState();
  const asset = findAsset(q) ?? s.assets[0];
  if (!asset) return { text: "Ajoutez d'abord un bien : je pourrai ensuite y classer vos documents." };
  const kind = /assur/.test(q)
    ? "INSURANCE"
    : /bail|contrat/.test(q)
      ? "LEASE"
      : /etat des lieux/.test(q)
        ? "INVENTORY"
        : /impot|declar|fiscal|foncier/.test(q)
          ? "TAX_FILING"
          : /enregistr/.test(q)
            ? "REGISTRATION"
            : /titre|acd|acte/.test(q)
              ? "TITLE_DEED"
              : /facture|devis|recu/.test(q)
                ? "INVOICE"
                : file.kind === "image"
                  ? "PHOTO"
                  : "INVOICE";
  const label = file.name.replace(/\.[a-z0-9]+$/i, "");
  return {
    text: `J'ai reçu « ${file.name} ». En mode démo, je ne lis pas son contenu : je vous propose de le classer dans les documents de ${asset.name}.`,
    proposal: { name: "file_document", input: { attachmentId: file.id, assetId: asset.id, kind, label } },
  };
}
