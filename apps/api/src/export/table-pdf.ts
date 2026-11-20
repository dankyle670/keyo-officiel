import { z } from "zod";
import { PdfDoc, textWidth } from "./pdf.ts";

/** Tableau envoyé par l'app (tel qu'affiché dans le chat, mise en forme retirée). */
export const TableExport = z.object({
  title: z.string().max(120).optional(),
  head: z.array(z.string().max(200)).min(1).max(12),
  rows: z.array(z.array(z.string().max(400)).max(12)).max(500),
  today: z.iso.date(),
});
export type TableExport = z.infer<typeof TableExport>;

const C = { ink: "#0B1B33", muted: "#55657D", line: "#E2E7EE", head: "#E9EFF5", zebra: "#F3F6F9", total: "#DDF7EA", mint: "#2ED47A" };
const plain = (s: string) => s.replace(/\*\*|__|`/g, "").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").trim();
const isNumeric = (rows: string[][], k: number) => rows.some((r) => r[k]) && rows.every((r) => !r[k] || /^[\s~≈<>+−-]*\d/.test(r[k]!));
const isTotal = (r: string[]) => /^(total|ensemble|sous-total)/i.test(r[0] ?? "");
const fr = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

/** Coupe un texte trop long pour sa colonne (points de suspension). */
function fit(s: string, width: number, size: number, bold: boolean) {
  if (textWidth(s, size, bold) <= width) return s;
  let t = s;
  while (t.length > 1 && textWidth(`${t}…`, size, bold) > width) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

/** PDF d'un tableau à la charte Keyo : en-tête teinté, lignes alternées, total en évidence. */
export function tablePdf(t: TableExport): Buffer {
  const head = t.head.map(plain);
  const rows = t.rows.map((r) => head.map((_, k) => plain(r[k] ?? "")));
  const size = 10;
  const natural = head.map((h, k) => Math.min(220, Math.max(textWidth(h, size, true), ...rows.map((r) => textWidth(r[k]!, size, isTotal(r)))) + 20));
  const landscape = natural.reduce((a, b) => a + b, 0) > 483 || head.length > 5;
  const doc = landscape ? new PdfDoc(842, 595) : new PdfDoc();
  const M = 48;
  const avail = doc.width - 2 * M;
  const total = natural.reduce((a, b) => a + b, 0);
  const widths = natural.map((w) => (w / total) * avail);
  const right = head.map((_, k) => k > 0 && isNumeric(rows, k));
  const rowH = 24;

  const header = (first: boolean) => {
    doc.text(M, doc.height - 56, 18, "Keyo", { bold: true });
    doc.rect(M, doc.height - 64, 28, 3, C.mint);
    doc.text(doc.width - M, doc.height - 50, 9, `Exporté le ${fr(t.today)}`, { color: C.muted, align: "right" });
    let y = doc.height - 98;
    if (first && t.title) {
      doc.text(M, y, 14, fit(plain(t.title), avail, 14, true), { bold: true });
      y -= 26;
    }
    return y;
  };
  const headRow = (y: number) => {
    doc.rect(M, y - 7, avail, rowH, C.head);
    let x = M;
    head.forEach((h, k) => {
      doc.text(right[k] ? x + widths[k]! - 10 : x + 10, y, size, fit(h, widths[k]! - 20, size, true), { bold: true, align: right[k] ? "right" : "left" });
      x += widths[k]!;
    });
    return y - rowH;
  };

  let y = headRow(header(true));
  rows.forEach((r, j) => {
    if (y < 70) {
      doc.newPage();
      y = headRow(header(false));
    }
    const tot = isTotal(r);
    if (tot) doc.rect(M, y - 7, avail, rowH, C.total);
    else if (j % 2 === 1) doc.rect(M, y - 7, avail, rowH, C.zebra);
    let x = M;
    r.forEach((c, k) => {
      doc.text(right[k] ? x + widths[k]! - 10 : x + 10, y, size, fit(c, widths[k]! - 20, size, tot), { bold: tot, align: right[k] ? "right" : "left" });
      x += widths[k]!;
    });
    doc.line(M, y - 7, M + avail, y - 7, C.line, 0.5);
    y -= rowH;
  });
  doc.text(M, 40, 8, "Généré par l'agent Keyo à partir de vos données. Valeurs indicatives, à vérifier avec un professionnel si nécessaire.", { color: C.muted });
  return doc.toBuffer();
}
