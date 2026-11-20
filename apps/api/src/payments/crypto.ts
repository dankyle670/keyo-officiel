import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Chiffrement des numéros de réception et des IBAN (AES-256-GCM). Clé : KEYO_DATA_KEY (32 octets
 * en base64). Sans clé, une clé de développement fixe est utilisée : à ne jamais laisser en production.
 */
let warned = false;
function key(): Buffer {
  const raw = process.env.KEYO_DATA_KEY;
  if (raw) {
    const k = Buffer.from(raw, "base64");
    if (k.length !== 32) throw new Error("KEYO_DATA_KEY doit faire 32 octets en base64");
    return k;
  }
  if (!warned && process.env.NODE_ENV !== "test") console.warn("KEYO_DATA_KEY absent : clé de développement utilisée pour chiffrer les comptes de paiement.");
  warned = true;
  return createHash("sha256").update("keyo-dev-only-key").digest();
}

export function seal(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), data].map((b) => b.toString("base64")).join(".");
}

export function open(sealed: string): string {
  const [iv, tag, data] = sealed.split(".").map((p) => Buffer.from(p, "base64"));
  const d = createDecipheriv("aes-256-gcm", key(), iv!);
  d.setAuthTag(tag!);
  return Buffer.concat([d.update(data!), d.final()]).toString("utf8");
}

/** Empreinte stable (sans le secret en clair) pour repérer un compte déjà enregistré. */
export const fingerprint = (s: string) => createHash("sha256").update(`keyo:${s.replace(/\s+/g, "").toUpperCase()}`).digest("hex");
