/**
 * Petit générateur PDF sans dépendance : texte Helvetica (encodage WinAnsi, accents français et
 * euro), traits et aplats de couleur, plusieurs pages. Utilisé par les reçus et les exports de tableaux.
 */
const WIN_ANSI_EXTRA: Record<string, number> = { "€": 0x80, "’": 0x92, "–": 0x96, "—": 0x97, "•": 0x95, "…": 0x85, "œ": 0x9c, "Œ": 0x8c, " ": 0x20, " ": 0x20 };

export function encode(text: string): string {
  let out = "";
  for (const ch of text) {
    const code = WIN_ANSI_EXTRA[ch] ?? ch.charCodeAt(0);
    const c = code > 255 ? 0x3f : code;
    const s = String.fromCharCode(c);
    out += s === "(" || s === ")" || s === "\\" ? `\\${s}` : c < 32 || c > 126 ? `\\${c.toString(8).padStart(3, "0")}` : s;
  }
  return out;
}

// Largeurs des caractères ASCII 32 à 126 (métriques Adobe de Helvetica et Helvetica-Bold, en millièmes).
const W_REGULAR = "278 278 355 556 556 889 667 191 333 333 389 584 278 333 278 278 556 556 556 556 556 556 556 556 556 556 278 278 584 584 584 556 1015 667 667 722 722 667 611 778 722 278 500 667 556 833 722 778 667 778 722 667 611 722 667 944 667 667 611 278 278 278 469 556 333 556 556 500 556 556 278 556 556 222 222 500 222 833 556 556 556 556 333 500 278 556 500 722 500 500 500 334 260 334 584".split(" ").map(Number);
const W_BOLD = "278 333 474 556 556 889 722 238 333 333 389 584 278 333 278 278 556 556 556 556 556 556 556 556 556 556 333 333 584 584 584 611 975 722 722 722 722 667 611 778 722 278 556 722 611 833 722 778 667 778 722 667 611 722 667 944 667 667 611 333 278 333 584 556 333 556 611 556 611 556 333 611 611 278 278 556 278 889 611 611 611 611 389 556 333 611 556 778 556 556 500 389 280 389 584".split(" ").map(Number);

/** Largeur d'un texte en Helvetica (points). Les lettres accentuées ont la largeur de leur lettre de base. */
export const textWidth = (s: string, size: number, bold = false) => {
  const w = bold ? W_BOLD : W_REGULAR;
  let total = 0;
  for (const ch of s) {
    const base = ch.normalize("NFD")[0]!;
    const c = base.charCodeAt(0);
    total += c >= 32 && c <= 126 ? w[c - 32]! : ch === "’" ? 222 : ch === "\u00a0" || ch === "\u202f" ? 278 : 556;
  }
  return (total / 1000) * size;
};

const rgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => (v / 255).toFixed(3)).join(" ");
};

export class PdfDoc {
  private pages: string[][] = [[]];
  constructor(
    readonly width = 595,
    readonly height = 842,
  ) {}

  private get ops() {
    return this.pages[this.pages.length - 1]!;
  }
  newPage() {
    this.pages.push([]);
  }
  text(x: number, y: number, size: number, s: string, opts: { bold?: boolean; color?: string; align?: "left" | "right" } = {}) {
    const dx = opts.align === "right" ? x - textWidth(s, size, opts.bold) : x;
    this.ops.push(`BT ${rgb(opts.color ?? "#0B1B33")} rg /${opts.bold ? "F2" : "F1"} ${size} Tf ${dx.toFixed(1)} ${y.toFixed(1)} Td (${encode(s)}) Tj ET`);
  }
  line(x1: number, y1: number, x2: number, y2: number, color = "#E2E7EE", w = 0.8) {
    this.ops.push(`${rgb(color)} RG ${w} w ${x1} ${y1} m ${x2} ${y2} l S`);
  }
  rect(x: number, y: number, w: number, h: number, fill: string) {
    this.ops.push(`${rgb(fill)} rg ${x.toFixed(1)} ${y.toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)} re f`);
  }

  toBuffer(): Buffer {
    const n = this.pages.length;
    const objects = ["<< /Type /Catalog /Pages 2 0 R >>", `<< /Type /Pages /Kids [${this.pages.map((_, i) => `${5 + i * 2} 0 R`).join(" ")}] /Count ${n} >>`, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>"];
    for (const [i, ops] of this.pages.entries()) {
      const stream = ops.join("\n");
      objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${this.width} ${this.height}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${6 + i * 2} 0 R >>`);
      objects.push(`<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`);
    }
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
}
