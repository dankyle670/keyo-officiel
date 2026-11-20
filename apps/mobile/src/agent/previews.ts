import { useEffect, useState } from "react";
import { fetchPreviews, type LinkPreview } from "./api";

/** Aperçus des sources web, gardés pendant la session (une seule demande par page). */
const cache = new Map<string, LinkPreview>();
const pending = new Set<string>();
const listeners = new Set<() => void>();

async function load(urls: string[]) {
  const missing = urls.filter((u) => !cache.has(u) && !pending.has(u));
  if (!missing.length) return;
  missing.forEach((u) => pending.add(u));
  try {
    for (const p of await fetchPreviews(missing.slice(0, 12))) cache.set(p.url, p);
  } catch {
    // Hors ligne ou serveur indisponible : les cartes gardent le nom du site.
    missing.forEach((u) => cache.set(u, { url: u }));
  } finally {
    missing.forEach((u) => pending.delete(u));
    listeners.forEach((l) => l());
  }
}

export function usePreviews(urls: string[]): Record<string, LinkPreview | undefined> {
  const key = urls.join("\n");
  const [, tick] = useState(0);
  useEffect(() => {
    const l = () => tick((n) => n + 1);
    listeners.add(l);
    void load(urls);
    return () => void listeners.delete(l);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return Object.fromEntries(urls.map((u) => [u, cache.get(u)]));
}
