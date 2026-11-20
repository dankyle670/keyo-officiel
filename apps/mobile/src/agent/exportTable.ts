import { Share } from "react-native";
import { File, Paths } from "expo-file-system";
import { ownerHeader } from "@/billing/api";
import { today } from "@/data/period";
import { apiBase } from "./api";

/**
 * Export d'un tableau du chat : PDF à la charte Keyo (fabriqué par le serveur) ou fichier tableur
 * (CSV, ouvert par Excel, Numbers ou Google Sheets), puis feuille de partage (WhatsApp, e-mail…).
 */
export type TableData = { title?: string; head: string[]; rows: string[][] };

const plain = (s: string) =>
  s
    .replace(/\*\*|__|`/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .trim();

/** CSV au format français (séparateur « ; », accents lisibles par Excel). */
export function tableCsv(t: TableData) {
  const cell = (s: string) => {
    const v = plain(s);
    return /[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  };
  return `﻿${[t.head, ...t.rows].map((r) => r.map(cell).join(";")).join("\r\n")}\r\n`;
}

const fileName = (t: TableData, ext: string) => {
  const base = plain(t.title ?? "tableau")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\w]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase()
    .slice(0, 40);
  return `keyo-${base || "tableau"}-${today()}.${ext}`;
};

export async function exportTable(t: TableData, kind: "pdf" | "csv") {
  const file = new File(Paths.cache, fileName(t, kind));
  if (file.exists) file.delete();
  if (kind === "csv") {
    file.create();
    file.write(tableCsv(t));
  } else {
    const res = await fetch(`${apiBase()}/agent/export/table.pdf`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-keyo-owner": ownerHeader() },
      body: JSON.stringify({ title: t.title ? plain(t.title) : undefined, head: t.head, rows: t.rows, today: today() }),
    });
    if (!res.ok) throw new Error("Export PDF indisponible pour l'instant.");
    file.create();
    file.write(new Uint8Array(await res.arrayBuffer()));
  }
  await Share.share({ url: file.uri, title: t.title ? plain(t.title) : "Tableau Keyo" });
}
