/**
 * Texte préparé pour la lecture à voix haute : montants et pourcentages en toutes lettres, unités
 * dites en entier, mise en forme retirée, tableaux lus ligne par ligne. Découpé en passages courts,
 * lus l'un après l'autre (pauses naturelles entre les phrases et les paragraphes).
 */
const UNITS = ["zéro", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf", "dix", "onze", "douze", "treize", "quatorze", "quinze", "seize"];
const TENS = ["", "dix", "vingt", "trente", "quarante", "cinquante", "soixante"];

function below100(n: number): string {
  if (n <= 16) return UNITS[n]!;
  if (n < 20) return `dix-${UNITS[n - 10]}`;
  if (n < 70) {
    const [t, u] = [Math.floor(n / 10), n % 10];
    return u === 0 ? TENS[t]! : u === 1 ? `${TENS[t]} et un` : `${TENS[t]}-${UNITS[u]}`;
  }
  if (n < 80) return n === 71 ? "soixante et onze" : `soixante-${below100(n - 60)}`;
  return n === 80 ? "quatre-vingts" : `quatre-vingt-${below100(n - 80)}`;
}

/** 0 à 999. `final` : le nombre termine l'expression (« deux cents », mais « deux cent mille »). */
function below1000(n: number, final: boolean): string {
  const [h, r] = [Math.floor(n / 100), n % 100];
  const rest = r ? below100(r) : "";
  const tail = !final && rest === "quatre-vingts" ? "quatre-vingt" : rest;
  if (h === 0) return tail;
  const hundreds = h === 1 ? "cent" : `${UNITS[h]} cent${r === 0 && final ? "s" : ""}`;
  return tail ? `${hundreds} ${tail}` : hundreds;
}

/** Nombre entier en toutes lettres (orthographe traditionnelle). */
export function numberToFrench(n: number): string {
  if (!Number.isFinite(n)) return "";
  if (n < 0) return `moins ${numberToFrench(-n)}`;
  n = Math.floor(n);
  if (n === 0) return "zéro";
  const parts: string[] = [];
  const scales: [number, string][] = [
    [1e12, "billion"],
    [1e9, "milliard"],
    [1e6, "million"],
  ];
  for (const [v, word] of scales) {
    const q = Math.floor(n / v);
    if (q) {
      // « millions » et « milliards » sont des noms : « deux cents millions », « quatre-vingts millions ».
      parts.push(`${q === 1 ? "un" : below1000OrMore(q, true)} ${word}${q > 1 ? "s" : ""}`);
      n %= v;
    }
  }
  const k = Math.floor(n / 1000);
  if (k) {
    parts.push(k === 1 ? "mille" : `${below1000(k, false)} mille`);
    n %= 1000;
  }
  if (n) parts.push(below1000(n, true));
  return parts.join(" ");
}
const below1000OrMore = (n: number, final: boolean) => (n < 1000 ? below1000(n, final) : numberToFrench(n));

/** Nombre écrit à la française (« 1 092 200 000 », « 39,5 », « 45,50 ») en toutes lettres. */
function spokenNumber(raw: string) {
  const [int, dec] = raw.replace(/[\s  ]/g, "").split(",");
  const whole = numberToFrench(Number(int));
  if (!dec) return whole;
  // « 0,5 » : zéro virgule cinq ; « 1,05 » : un virgule zéro cinq.
  const lead = dec.match(/^0+/)?.[0].length ?? 0;
  const decWords = [..."0".repeat(lead)].map(() => "zéro").concat(Number(dec) ? [numberToFrench(Number(dec))] : []);
  return `${whole} virgule ${decWords.join(" ")}`;
}

const ordinal = (n: number) => {
  if (n === 1) return "premier";
  const w = numberToFrench(n);
  return w.endsWith("un") ? `${w}ième` : w.endsWith("cinq") ? `${w}uième` : w.endsWith("neuf") ? `${w.slice(0, -1)}vième` : `${w.replace(/(vingt|cent)s$/, "$1").replace(/e$/, "")}ième`;
};

const NUM = String.raw`\d{1,3}(?:[\s  ]\d{3})+(?:,\d+)?|\d+(?:,\d+)?`;

/** Une ligne de texte prête à être dite. */
export function spokenLine(line: string): string {
  let s = line
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/https?:\/\/\S+/g, "le lien indiqué")
    .replace(/\*\*|__|`|~~/g, "")
    .replace(/(^|\s)[*_]([^*_]+)[*_](?=\s|$|[.,;:!?])/g, "$1$2")
    .replace(/\s*[—–]\s*/g, ", ")
    .replace(/\s*→\s*/g, ", puis ")
    .replace(/\benv\.\s*/gi, "environ ")
    .replace(/\bn°\s*/gi, "numéro ")
    .replace(/\bm²/g, " mètres carrés")
    .replace(/\bha\b/g, "hectares")
    .replace(/\bTTC\b/g, "toutes taxes comprises")
    .replace(/\bHT\b/g, "hors taxes")
    .replace(/\bTVA\b/g, "T V A");
  // Ordinaux : 1er, 1re, 3e, 7ème.
  s = s.replace(/\b(\d+)(?:er|re|e|ème|eme)\b/g, (_, n: string) => (n === "1" ? "premier" : ordinal(Number(n))));
  // Montants avec unité : « 641 000 000 FCFA » → « six cent quarante et un millions de francs CFA ».
  s = s.replace(new RegExp(String.raw`(${NUM})(?:\s*(Md|M|k)(?![A-Za-zÀ-ÿ]))?(?:\s*(FCFA|F CFA|XOF|€|EUR|euros?|%|millions?|milliards?)(?![A-Za-zÀ-ÿ²]))?`, "g"), (all, num: string, scale: string | undefined, unit: string | undefined) => {
    const value = Number(num.replace(/[\s  ]/g, "").replace(",", "."));
    let words = spokenNumber(num);
    if (scale === "M") words += value >= 2 ? " millions" : " million";
    else if (scale === "Md") words += value >= 2 ? " milliards" : " milliard";
    else if (scale === "k") words += " mille";
    if (!unit) return words;
    if (unit === "%") return `${words} pour cent`;
    if (/^million|^milliard/.test(unit)) return `${words} ${unit}`;
    const currency = /FCFA|F CFA|XOF/.test(unit) ? (value >= 2 ? "francs CFA" : "franc CFA") : value >= 2 ? "euros" : "euro";
    // « de » après un nombre rond de millions : « deux millions de francs CFA ».
    const round = !scale && !num.includes(",") && value >= 1e6 && value % 1e6 === 0;
    return `${words} ${round || scale === "M" || scale === "Md" ? "de " : ""}${currency}`;
  });
  return s.replace(/\s{2,}/g, " ").trim();
}

const endsSentence = (s: string) => /[.!?:…]$/.test(s);
const sentence = (s: string) => (s && !endsSentence(s) ? `${s.replace(/[;,]$/, "")}.` : s);

/** Passages à lire, dans l'ordre. */
export function speechChunks(markdown: string): string[] {
  const lines = markdown.replace(/\r/g, "").split("\n");
  const out: string[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) out.push(para.join(" "));
    para = [];
  };
  const cells = (l: string) =>
    l
      .trim()
      .replace(/^\||\|$/g, "")
      .split("|")
      .map((c) => spokenLine(c.trim()));
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!.trim();
    if (/^```/.test(raw)) {
      while (i + 1 < lines.length && !/^```/.test(lines[i + 1]!.trim())) i++;
      i++;
      continue;
    }
    // Tableau : chaque ligne devient une phrase (« Villa : valeur, 641 millions ; fiabilité, faible. »).
    if (/^\|.*\|$/.test(raw) && i + 1 < lines.length && /^\|?[\s:|-]+\|?$/.test(lines[i + 1]!.trim()) && lines[i + 1]!.includes("-")) {
      flush();
      const head = cells(raw);
      i += 2;
      for (; i < lines.length && /^\|.*\|$/.test(lines[i]!.trim()); i++) {
        const row = cells(lines[i]!);
        const pairs = row.slice(1).map((c, k) => (c ? `${head[k + 1]?.toLowerCase() ?? ""}, ${c}` : "")).filter(Boolean);
        out.push(sentence(pairs.length ? `${row[0]} : ${pairs.join(" ; ")}` : row[0]!));
      }
      i--;
      continue;
    }
    if (!raw || /^(-{3,}|\*{3,}|_{3,})$/.test(raw) || /^sources?\s*:/i.test(raw)) {
      flush();
      continue;
    }
    const heading = raw.match(/^#{1,6}\s+(.*)$/);
    const item = raw.match(/^(?:[-*•+]|\d+[.)])\s+(.*)$/);
    const quote = raw.match(/^>\s?(.*)$/);
    if (heading) {
      flush();
      out.push(sentence(spokenLine(heading[1]!)));
    } else if (item) {
      flush();
      out.push(sentence(spokenLine(item[1]!)));
    } else para.push(sentence(spokenLine(quote ? quote[1]! : raw)));
  }
  flush();
  return out.filter((c) => /[\p{L}\p{N}]/u.test(c));
}
