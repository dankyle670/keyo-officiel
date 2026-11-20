import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * Aperçu des pages citées par l'agent (titre, site, image, icône), comme les sources dans Claude.
 * Récupéré par le serveur, pas par le téléphone : une seule lecture par page, gardée 24 h.
 * Protégé contre les adresses internes (le serveur ne lit que des pages publiques).
 */
export type LinkPreview = { url: string; title?: string; site?: string; description?: string; image?: string; icon?: string };

const TTL = 24 * 3600_000;
const MAX_BYTES = 400_000;
const cache = new Map<string, { at: number; value: LinkPreview }>();

/** Adresse privée, locale ou réservée : jamais lue. */
export function privateAddress(ip: string) {
  if (isIP(ip) === 6) {
    const v = ip.toLowerCase();
    if (v.startsWith("::ffff:")) return privateAddress(v.slice(7));
    return v === "::1" || v === "::" || /^f[cd]/.test(v) || /^fe[89ab]/.test(v);
  }
  const [a, b] = ip.split(".").map(Number) as [number, number];
  return a === 10 || a === 127 || a === 0 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
}

async function publicUrl(raw: string) {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  if (u.username || u.password || (u.port && u.port !== "80" && u.port !== "443")) return null;
  const host = u.hostname.replace(/^\[|\]$/g, "");
  const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => []);
  if (!addrs.length || addrs.some((a) => privateAddress(a.address))) return null;
  return u;
}

const decode = (s: string) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/\s+/g, " ")
    .trim();

/** Balises meta et icône d'une page HTML. */
export function parsePreview(html: string, base: URL): Omit<LinkPreview, "url"> {
  const head = html.slice(0, 200_000);
  const meta = (...keys: string[]) => {
    for (const k of keys) {
      const re = new RegExp(`<meta[^>]+(?:property|name)=["']${k}["'][^>]*>`, "i");
      const tag = head.match(re)?.[0];
      const content = tag?.match(/content=["']([^"']*)["']/i)?.[1];
      if (content?.trim()) return decode(content);
    }
    return undefined;
  };
  const abs = (v?: string) => {
    if (!v) return undefined;
    try {
      const u = new URL(v, base);
      return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : undefined;
    } catch {
      return undefined;
    }
  };
  const icons = [...head.matchAll(/<link[^>]+rel=["'][^"']*icon[^"']*["'][^>]*>/gi)].map((m) => m[0].match(/href=["']([^"']+)["']/i)?.[1]).filter((h): h is string => Boolean(h) && !/\.svg(\?|$)/i.test(h!));
  const title = meta("og:title", "twitter:title") ?? (head.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ? decode(head.match(/<title[^>]*>([^<]*)<\/title>/i)![1]!) : undefined);
  return {
    title: title?.slice(0, 200),
    site: meta("og:site_name", "application-name")?.slice(0, 80),
    description: meta("og:description", "description", "twitter:description")?.slice(0, 300),
    image: abs(meta("og:image", "og:image:url", "twitter:image", "twitter:image:src")),
    icon: abs(icons.find((h) => /apple-touch|180|192/.test(h)) ?? icons[0]) ?? abs("/favicon.ico"),
  };
}

async function fetchPreview(raw: string): Promise<LinkPreview> {
  let url = await publicUrl(raw);
  const fallback: LinkPreview = { url: raw };
  try {
    // Redirections suivies à la main : chaque étape est revérifiée (pas de rebond vers le réseau interne).
    for (let hop = 0; url && hop < 4; hop++) {
      const res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(5000), headers: { "user-agent": "Mozilla/5.0 (compatible; KeyoPreview/1.0)", accept: "text/html,application/xhtml+xml", "accept-language": "fr-FR,fr;q=0.9" } });
      if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
        url = await publicUrl(new URL(res.headers.get("location")!, url).toString());
        continue;
      }
      if (!res.ok || !/html/i.test(res.headers.get("content-type") ?? "")) return { ...fallback, icon: `${url.origin}/favicon.ico` };
      const reader = res.body?.getReader();
      let html = "";
      const dec = new TextDecoder();
      for (let n = 0; reader; ) {
        const { value, done } = await reader.read();
        if (done) break;
        n += value.length;
        html += dec.decode(value, { stream: true });
        if (n > MAX_BYTES || /<\/head>/i.test(html)) {
          await reader.cancel().catch(() => undefined);
          break;
        }
      }
      return { url: raw, ...parsePreview(html, url) };
    }
  } catch {
    // Page lente ou inaccessible : la carte s'affiche avec le nom du site.
  }
  return fallback;
}

export async function previews(urls: string[]): Promise<LinkPreview[]> {
  const now = Date.now();
  return Promise.all(
    [...new Set(urls)].slice(0, 12).map(async (u) => {
      const hit = cache.get(u);
      if (hit && now - hit.at < TTL) return hit.value;
      const value = await fetchPreview(u);
      cache.set(u, { at: now, value });
      if (cache.size > 2000) cache.delete(cache.keys().next().value!);
      return value;
    }),
  );
}
