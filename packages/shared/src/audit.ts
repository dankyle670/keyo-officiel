import type { Agreement, Asset, AssetEvent, AssetShare, AssetUnit, Document, MaintenancePlan, Mission, Party, ScheduleItem } from "./domain.ts";
import { formatMoney } from "./money.ts";
import { cap, profileOf } from "./modules/catalog.ts";
import { formatShare, shareTotal } from "./patrimony.ts";
import { dueStatus } from "./schedule.ts";
import { daysBetween } from "./status.ts";

/**
 * Contrôle de gestion (l'« ops » de Keyo) : vérifie, à partir des seules données du propriétaire,
 * que tout est en ordre (pièces, fiscalité, encaissements, baux, incidents, entretien).
 * Déterministe et testable : c'est la source de vérité. Le sous-agent IA s'en sert pour
 * prioriser et expliquer, il ne décide pas seul de ce qui manque.
 */
export type AuditSeverity = "HIGH" | "MEDIUM" | "LOW";
export type AuditArea = "DOCUMENTS" | "FISCAL" | "PAYMENTS" | "LEASES" | "INCIDENTS" | "MAINTENANCE" | "OCCUPANCY";

export type AuditFinding = {
  id: string;
  severity: AuditSeverity;
  area: AuditArea;
  title: string;
  detail: string;
  assetId?: string;
  agreementId?: string;
  eventId?: string;
  /** Demande toute prête à envoyer à l'agent Keyo pour régler le point. */
  fix?: { label: string; prompt: string };
};

export type AuditInput = {
  assets: Asset[];
  units: AssetUnit[];
  parties: Party[];
  agreements: Agreement[];
  schedule: ScheduleItem[];
  events: AssetEvent[];
  documents: Document[];
  maintenance?: MaintenancePlan[];
  missions?: Mission[];
  shares?: AssetShare[];
  /** Date du jour (AAAA-MM-JJ). */
  today: string;
};

export type AuditReport = { findings: AuditFinding[]; score: number; counts: Record<AuditSeverity, number>; checkedAt: string };

export const AUDIT_AREA_LABEL: Record<AuditArea, string> = {
  DOCUMENTS: "Pièces",
  FISCAL: "Fiscalité",
  PAYMENTS: "Encaissements",
  LEASES: "Contrats",
  INCIDENTS: "Incidents",
  MAINTENANCE: "Entretien",
  OCCUPANCY: "Occupation",
};

const RANK: Record<AuditSeverity, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
const WEIGHT: Record<AuditSeverity, number> = { HIGH: 15, MEDIUM: 6, LOW: 2 };

const isCurrent = (a: Agreement, today: string) => a.startDate <= today && (!a.endDate || a.endDate >= today);

/** Pièce rattachée au contrat : par identifiant, sinon (données anciennes) par le prénom dans le libellé. */
function hasAgreementDoc(docs: Document[], kind: Document["kind"], a: Agreement, party?: Party) {
  return docs.some(
    (d) =>
      d.kind === kind &&
      (d.agreementId === a.id || (!d.agreementId && d.assetId === a.assetId && !!party && d.label.toLowerCase().includes(party.firstName.toLowerCase()))),
  );
}

export function runAudit(input: AuditInput): AuditReport {
  const { today } = input;
  const year = Number(today.slice(0, 4));
  const out: AuditFinding[] = [];
  const asset = (id: string) => input.assets.find((x) => x.id === id);
  const party = (id: string) => input.parties.find((p) => p.id === id);
  const unit = (id: string) => input.units.find((u) => u.id === id);
  const leases = input.agreements.filter((a) => a.kind === "LEASE");
  const current = leases.filter((a) => isCurrent(a, today));
  const who = (a: Agreement) => {
    const p = party(a.partyId);
    return `${p ? `${p.firstName} ${p.lastName}` : "Occupant"}, ${asset(a.assetId)?.name ?? ""}${unit(a.unitId) ? ` (${unit(a.unitId)!.label})` : ""}`;
  };

  const prof = (assetId: string) => profileOf(asset(assetId)?.type ?? "REAL_ESTATE");

  // Pièces des contrats en cours.
  for (const a of current) {
    const p = party(a.partyId);
    const pr = prof(a.assetId);
    if (!hasAgreementDoc(input.documents, "LEASE", a, p))
      out.push({
        id: `doc-lease-${a.id}`,
        severity: "HIGH",
        area: "DOCUMENTS",
        title: `${cap(pr.agreement.one)} signé manquant`,
        detail: `Aucun ${pr.agreement.one} signé n'est classé pour ${who(a)}. Sans lui, un recours en cas d'impayé est difficile.`,
        assetId: a.assetId,
        agreementId: a.id,
        fix: { label: "Régulariser", prompt: `Aide-moi à régulariser le ${pr.agreement.one} de ${who(a)} : que dois-je faire signer et classer ?` },
      });
    if (pr.needsInventory && !hasAgreementDoc(input.documents, "INVENTORY", a, p))
      out.push({
        id: `doc-inventory-${a.id}`,
        severity: "MEDIUM",
        area: "DOCUMENTS",
        title: "État des lieux d'entrée manquant",
        detail: `Pas d'état des lieux d'entrée pour ${who(a)}. Il protège la caution à la sortie.`,
        assetId: a.assetId,
        agreementId: a.id,
        fix: { label: "Organiser une visite", prompt: `Confie à un gérant terrain l'état des lieux de ${who(a)}.` },
      });
    if (!a.deposit || a.deposit.amount === 0)
      out.push({
        id: `lease-deposit-${a.id}`,
        severity: "LOW",
        area: "LEASES",
        title: "Pas de caution",
        detail: `Le contrat de ${who(a)} ne prévoit aucune caution.`,
        assetId: a.assetId,
        agreementId: a.id,
      });
    if (a.endDate && daysBetween(today, a.endDate) <= 60)
      out.push({
        id: `lease-ending-${a.id}`,
        severity: "MEDIUM",
        area: "LEASES",
        title: "Contrat bientôt terminé",
        detail: `Le contrat de ${who(a)} se termine le ${a.endDate}. Renouveler ou préparer la remise en location.`,
        assetId: a.assetId,
        agreementId: a.id,
        fix: { label: "Anticiper", prompt: `Le contrat de ${who(a)} se termine le ${a.endDate}. Que me conseilles-tu ?` },
      });
  }

  // Pièces des actifs.
  for (const as of input.assets) {
    const docs = input.documents.filter((d) => d.assetId === as.id);
    const pr = profileOf(as.type);
    if (!docs.some((d) => d.kind === "TITLE_DEED"))
      out.push({
        id: `doc-title-${as.id}`,
        severity: "MEDIUM",
        area: "DOCUMENTS",
        title: `${cap(pr.titleDoc.split(" ou ")[0]!)} non classé${pr.titleDoc.startsWith("carte") ? "e" : ""}`,
        detail: `${as.name} : aucun ${pr.titleDoc.startsWith("carte") ? "exemplaire de la " : ""}${pr.titleDoc} dans les documents.`,
        assetId: as.id,
      });
    if (!docs.some((d) => d.kind === "INSURANCE"))
      out.push({
        id: `doc-insurance-${as.id}`,
        severity: "MEDIUM",
        area: "DOCUMENTS",
        title: "Assurance non classée",
        detail: `${as.name} : aucune attestation d'assurance. En cas de sinistre, c'est la première pièce demandée.`,
        assetId: as.id,
      });
    // Enregistrement des baux en Côte d'Ivoire.
    if (as.location.country === "CI" && pr.needsRegistration)
      for (const a of current.filter((l) => l.assetId === as.id))
        if (!hasAgreementDoc(input.documents, "REGISTRATION", a, party(a.partyId)))
          out.push({
            id: `fiscal-registration-${a.id}`,
            severity: "MEDIUM",
            area: "FISCAL",
            title: `${cap(pr.agreement.one)} non enregistré aux impôts`,
            detail: `Aucune preuve d'enregistrement du ${pr.agreement.one} de ${who(a)} auprès de la DGI. À vérifier avec votre conseiller.`,
            assetId: as.id,
            agreementId: a.id,
          });
  }

  // Biens de famille : parts réparties à 100 %, membres identifiés.
  for (const as of input.assets) {
    if (as.holding !== "FAMILY") continue;
    const total = shareTotal(as, input.shares ?? []);
    if (total !== 1000)
      out.push({
        id: `family-shares-${as.id}`,
        severity: "MEDIUM",
        area: "DOCUMENTS",
        title: "Parts de la famille incomplètes",
        detail: `${as.name} : les parts déclarées font ${formatShare(total)} au lieu de 100 %. La valeur de chacun ne peut pas être calculée justement.`,
        assetId: as.id,
        fix: { label: "Répartir les parts", prompt: `Aide-moi à répartir les parts de ${as.name} entre les membres de la famille.` },
      });
  }

  // Déclaration annuelle des revenus de l'année écoulée, par pays.
  const earnedLastYear = new Set(
    leases.filter((a) => a.startDate <= `${year - 1}-12-31` && (!a.endDate || a.endDate >= `${year - 1}-01-01`)).map((a) => asset(a.assetId)?.location.country).filter(Boolean) as string[],
  );
  for (const country of earnedLastYear) {
    const filed = input.documents.some((d) => d.kind === "TAX_FILING" && d.year === year - 1 && asset(d.assetId)?.location.country === country);
    if (filed) continue;
    const label =
      country === "CI"
        ? `Revenus fonciers ${year - 1} en Côte d'Ivoire : aucune déclaration ni avis d'imposition classé (impôt sur le revenu foncier, DGI).`
        : country === "FR"
          ? `Revenus fonciers ${year - 1} en France : aucune déclaration classée (micro-foncier ou formulaire 2044, au printemps).`
          : `Revenus locatifs ${year - 1} (${country}) : aucune déclaration fiscale classée.`;
    out.push({
      id: `fiscal-annual-${country}-${year - 1}`,
      severity: "MEDIUM",
      area: "FISCAL",
      title: `Déclaration des revenus ${year - 1}`,
      detail: `${label} À vérifier avec votre conseiller fiscal.`,
      fix: { label: "Préparer les chiffres", prompt: `Prépare le récapitulatif de mes revenus et dépenses ${year - 1} pour ma déclaration (${country}).` },
    });
  }

  // Encaissements : une seule ligne par contrat, la plus ancienne échéance en souffrance.
  for (const a of leases) {
    const overdue = input.schedule
      .filter((i) => i.agreementId === a.id)
      .map((i) => ({ i, st: dueStatus(i.expected, i.received, i.dueDate, today) }))
      .filter(({ st }) => st === "LATE" || st === "PARTIAL" || st === "UNPAID")
      .sort((x, y) => x.i.dueDate.localeCompare(y.i.dueDate));
    if (!overdue.length) continue;
    const first = overdue[0]!;
    const days = daysBetween(first.i.dueDate, today);
    out.push({
      id: `pay-${a.id}`,
      severity: overdue.some((o) => o.st === "UNPAID") ? "HIGH" : "MEDIUM",
      area: "PAYMENTS",
      title: overdue.length > 1 ? `${overdue.length} échéances en retard` : "Échéance en retard",
      detail: `${who(a)} : ${formatMoney(first.i.expected)} attendus depuis ${days} jour${days > 1 ? "s" : ""}.`,
      assetId: a.assetId,
      agreementId: a.id,
      fix: { label: "Relancer", prompt: `Relance ${party(a.partyId)?.firstName ?? "l'occupant"} pour son retard de paiement.` },
    });
  }

  // Logements libres.
  for (const u of input.units) {
    if (current.some((a) => a.unitId === u.id)) continue;
    const ended = leases.filter((a) => a.unitId === u.id && a.endDate && a.endDate < today).map((a) => a.endDate!).sort().pop();
    const pu = prof(u.assetId);
    out.push({
      id: `vacant-${u.id}`,
      severity: "LOW",
      area: "OCCUPANCY",
      title: `${cap(pu.unit.one)} libre`,
      detail: `${asset(u.assetId)?.name ?? ""}, ${u.label} : libre${ended ? ` depuis le ${ended}` : ""}.`,
      assetId: u.assetId,
      fix: { label: `Trouver un ${pu.occupant.one}`, prompt: `${u.label} à ${asset(u.assetId)?.name ?? ""} est libre. Aide-moi à trouver un ${pu.occupant.one}.` },
    });
  }

  // Incidents ouverts trop longtemps.
  for (const e of input.events) {
    if (e.status === "RESOLVED") continue;
    const age = daysBetween(e.reportedAt.slice(0, 10), today);
    const urgent = e.urgency === "HIGH" && age > 2;
    if (!urgent && age <= 14) continue;
    out.push({
      id: `incident-${e.id}`,
      severity: urgent ? "HIGH" : "MEDIUM",
      area: "INCIDENTS",
      title: urgent ? "Incident urgent sans solution" : "Incident ouvert depuis longtemps",
      detail: `${e.title} (${asset(e.assetId)?.name ?? ""}), signalé il y a ${age} jours.`,
      assetId: e.assetId,
      eventId: e.id,
      fix: { label: "Débloquer", prompt: `Où en est l'incident « ${e.title} » ? Demande des devis si besoin.` },
    });
  }

  // Entretien préventif et missions terrain.
  for (const m of input.maintenance ?? []) {
    const left = daysBetween(today, m.nextDueOn);
    if (left > 14) continue;
    out.push({
      id: `maintenance-${m.id}`,
      severity: left < 0 ? "MEDIUM" : "LOW",
      area: "MAINTENANCE",
      title: left < 0 ? "Entretien en retard" : "Entretien à prévoir",
      detail: `${m.label} (${asset(m.assetId)?.name ?? ""}) : ${left < 0 ? `prévu le ${m.nextDueOn}` : `dans ${left} jour${left > 1 ? "s" : ""}`}.`,
      assetId: m.assetId,
      fix: { label: "Planifier", prompt: `Organise l'entretien « ${m.label} » à ${asset(m.assetId)?.name ?? ""}.` },
    });
  }
  for (const m of input.missions ?? []) {
    if (m.status !== "PLANNED" || m.dueDate >= today) continue;
    out.push({
      id: `mission-${m.id}`,
      severity: "LOW",
      area: "MAINTENANCE",
      title: "Mission terrain sans compte rendu",
      detail: `${m.title} (${asset(m.assetId)?.name ?? ""}), prévue le ${m.dueDate}.`,
      assetId: m.assetId,
    });
  }

  out.sort((x, y) => RANK[x.severity] - RANK[y.severity]);
  const counts = { HIGH: 0, MEDIUM: 0, LOW: 0 } as Record<AuditSeverity, number>;
  out.forEach((f) => counts[f.severity]++);
  const score = Math.max(0, 100 - out.reduce((s, f) => s + WEIGHT[f.severity], 0));
  return { findings: out, score, counts, checkedAt: today };
}
