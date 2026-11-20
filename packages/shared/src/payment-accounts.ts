import { z } from "zod";

/**
 * Comptes de paiement du propriétaire. Keyo ne détient jamais de fonds :
 * - RECEIVE : là où l'agrégateur (CinetPay, PayDunya, Stripe) reverse les loyers payés en ligne ;
 * - SUBSCRIPTION : le moyen avec lequel le propriétaire paie son abonnement Keyo.
 * Un compte n'est utilisable qu'une fois vérifié (code SMS). Toute modification ou suppression
 * exige un nouveau code : c'est la porte d'entrée des détournements de loyers. L'agent ne peut
 * que les consulter, jamais les créer ni les modifier.
 */
export const MOBILE_MONEY_OPERATORS = ["WAVE", "ORANGE", "MTN", "MOOV"] as const;
export type MobileMoneyOperator = (typeof MOBILE_MONEY_OPERATORS)[number];
export const OPERATOR_LABEL: Record<MobileMoneyOperator, string> = { WAVE: "Wave", ORANGE: "Orange Money", MTN: "MTN MoMo", MOOV: "Moov Money" };

export const PaymentPurpose = z.enum(["RECEIVE", "SUBSCRIPTION"]);
export type PaymentPurpose = z.infer<typeof PaymentPurpose>;
export const PaymentAccountStatus = z.enum(["PENDING", "VERIFIED", "REJECTED"]);
export type PaymentAccountStatus = z.infer<typeof PaymentAccountStatus>;
export const PAYMENT_ACCOUNT_STATUS_LABEL: Record<PaymentAccountStatus, string> = { PENDING: "À vérifier", VERIFIED: "Vérifié", REJECTED: "Refusé" };

/** Numéro mobile ivoirien : +225 suivi de 10 chiffres commençant par 01, 05 ou 07. */
export const isIvorianMobile = (phone: string) => /^\+225(01|05|07)\d{8}$/.test(phone);

/** IBAN (dont UEMOA, 28 caractères pour la Côte d'Ivoire), contrôle de la clé mod 97. */
export function isValidIban(raw: string): boolean {
  const iban = raw.replace(/\s+/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(iban)) return false;
  const moved = iban.slice(4) + iban.slice(0, 4);
  let rest = 0;
  for (const ch of moved) {
    const v = /[A-Z]/.test(ch) ? String(ch.charCodeAt(0) - 55) : ch;
    for (const d of v) rest = (rest * 10 + Number(d)) % 97;
  }
  return rest === 1;
}

const holder = z.string().trim().min(2).max(80);
const assetIds = z.array(z.string()).max(50).default([]);

/** Saisie d'un nouveau compte (le numéro complet ne transite qu'à ce moment). */
export const NewPaymentAccount = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("MOBILE_MONEY"),
    purpose: PaymentPurpose,
    operator: z.enum(MOBILE_MONEY_OPERATORS),
    phone: z.string().refine(isIvorianMobile, "Numéro Mobile Money ivoirien attendu : +225 suivi de 10 chiffres (01, 05 ou 07)"),
    holder,
    assetIds,
    isDefault: z.boolean().default(false),
  }),
  z.object({
    kind: z.literal("BANK"),
    purpose: z.literal("RECEIVE"),
    bankName: z.string().trim().min(2).max(60),
    iban: z.string().refine(isValidIban, "IBAN invalide : vérifiez les caractères et la clé"),
    holder,
    assetIds,
    isDefault: z.boolean().default(false),
  }),
]);
export type NewPaymentAccount = z.input<typeof NewPaymentAccount>;

/** Compte tel que l'app le reçoit : jamais le numéro complet. */
export type PaymentAccountView = {
  id: string;
  purpose: PaymentPurpose;
  kind: "MOBILE_MONEY" | "BANK";
  label: string;
  masked: string;
  holder: string;
  status: PaymentAccountStatus;
  isDefault: boolean;
  assetIds: string[];
  createdAt: string;
  verifiedAt?: string;
  /** Avertissement non bloquant, par exemple titulaire différent du propriétaire. */
  warning?: string;
};

/** « Wave •••• 42 17 » ou « SGBCI •••• 0589 ». */
export function maskAccount(a: { kind: "MOBILE_MONEY"; operator: MobileMoneyOperator; phone: string } | { kind: "BANK"; bankName: string; iban: string }): { label: string; masked: string } {
  if (a.kind === "MOBILE_MONEY") {
    const d = a.phone.replace(/\D/g, "");
    return { label: OPERATOR_LABEL[a.operator], masked: `•••• ${d.slice(-4, -2)} ${d.slice(-2)}` };
  }
  const i = a.iban.replace(/\s+/g, "");
  return { label: a.bankName, masked: `•••• ${i.slice(-4)}` };
}

/**
 * Compte de réception d'un bien : celui qui lui est attribué, sinon le compte par défaut,
 * seulement s'il est vérifié. Sans compte, pas de paiement en ligne pour ce bien.
 */
export function receivingAccountFor<T extends Pick<PaymentAccountView, "purpose" | "status" | "isDefault" | "assetIds">>(accounts: T[], assetId: string): T | undefined {
  const ok = accounts.filter((a) => a.purpose === "RECEIVE" && a.status === "VERIFIED");
  return ok.find((a) => a.assetIds.includes(assetId)) ?? ok.find((a) => a.isDefault) ?? (ok.length === 1 ? ok[0] : undefined);
}

/** Le titulaire ressemble-t-il au propriétaire ? (comparaison souple, sans accents ni casse) */
export function holderMatches(holderName: string, ownerName: string): boolean {
  const words = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 1);
  const h = new Set(words(holderName));
  return words(ownerName).some((w) => h.has(w));
}
