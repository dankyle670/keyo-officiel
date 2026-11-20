import type { InvoiceRec } from "./store.ts";
import { encode, textWidth } from "../export/pdf.ts";

/**
 * Reçu de paiement de l'abonnement, en PDF d'une page, sans dépendance : texte en Helvetica
 * (encodage WinAnsi, qui couvre les accents français et le signe euro).
 */
const fr = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const money = (minor: number, c: string) =>
  c === "XOF" ? `${minor.toLocaleString("fr-FR").replace(/\s/g, " ")} FCFA` : `${(minor / 100).toLocaleString("fr-FR", { minimumFractionDigits: 2 }).replace(/\s/g, " ")} €`;

export function receiptPdf(inv: InvoiceRec, ownerName: string): Buffer {
  const ops: string[] = [];
  const text = (x: number, y: number, size: number, s: string, bold = false) => ops.push(`BT /${bold ? "F2" : "F1"} ${size} Tf ${x} ${y} Td (${encode(s)}) Tj ET`);
  const right = (x: number, y: number, size: number, s: string, bold = false) => text(x - textWidth(s, size, bold), y, size, s, bold);
  const line = (y: number) => ops.push(`0.85 G 0.8 w 56 ${y} m 539 ${y} l S`);

  text(56, 780, 22, "Keyo", true);
  text(56, 760, 10, "Vos biens, gérés d'ici.");
  right(539, 780, 14, inv.status === "PAID" ? "Reçu de paiement" : "Facture", true);
  right(539, 762, 10, inv.number);

  text(56, 715, 10, "Abonné", true);
  text(56, 700, 11, ownerName);
  text(330, 715, 10, "Période", true);
  text(330, 700, 11, `du ${fr(inv.periodStart)} au ${fr(inv.periodEnd)}`);
  text(330, 680, 10, "Émise le", true);
  text(400, 680, 11, fr(inv.issuedAt));
  if (inv.paidAt) {
    text(330, 664, 10, "Payée le", true);
    text(400, 664, 11, fr(inv.paidAt));
  }

  let y = 620;
  line(y + 14);
  text(56, y, 10, "Désignation", true);
  right(539, y, 10, "Montant TTC", true);
  y -= 22;
  for (const l of inv.lines) {
    text(56, y, 11, l.label);
    right(539, y, 11, money(l.amount, inv.currency));
    y -= 20;
  }
  line(y + 8);
  y -= 14;
  text(330, y, 10, "Dont TVA");
  right(539, y, 10, money(inv.vat, inv.currency));
  y -= 20;
  text(330, y, 12, "Total TTC", true);
  right(539, y, 12, money(inv.total, inv.currency), true);

  text(56, 90, 8, "Keyo est un service de DK Group. Les loyers de vos locataires ne transitent jamais par DK Group.");
  text(56, 78, 8, "Document généré automatiquement.");

  const stream = ops.join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
    `<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((o, i) => {
    offsets.push(Buffer.byteLength(pdf, "latin1"));
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, "latin1");
}
