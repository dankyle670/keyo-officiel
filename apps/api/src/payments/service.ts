import { createHash, randomInt } from "node:crypto";
import { CARD_BRAND_LABEL, cardExpired, holderMatches, maskAccount, NewPaymentAccount, receivingAccountFor, type PaymentAccountView } from "@keyo/shared";
import { CardError, SimulatedCardProvider, type CardProvider } from "./cards.ts";
import { z } from "zod";
import { fingerprint, seal } from "./crypto.ts";
import type { PaymentAccountRecord, PaymentAccountStore } from "./store.ts";

/** Envoi d'un code par SMS. Simulé tant qu'aucun fournisseur SMS n'est branché (code fixe 123456). */
export interface CodeSender {
  readonly simulated: boolean;
  send(to: string, text: string): Promise<void>;
}
export const SIMULATED_CODE = "123456";
export class SimulatedCodeSender implements CodeSender {
  readonly simulated = true;
  async send() {}
}

export const ChangeRequest = z.discriminatedUnion("op", [
  z.object({ op: z.literal("VERIFY") }),
  z.object({ op: z.literal("UPDATE"), patch: z.object({ assetIds: z.array(z.string()).max(50).optional(), isDefault: z.boolean().optional() }) }),
  z.object({ op: z.literal("DELETE") }),
]);
export type ChangeRequest = z.infer<typeof ChangeRequest>;

type Challenge = { id: string; ownerId: string; accountId: string; change: ChangeRequest; codeHash: string; expiresAt: number; attempts: number };
export type ChallengeView = { challengeId: string; sentTo: string; simulated: boolean; expiresInSeconds: number };

export class PaymentError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

const TTL_MS = 5 * 60_000;
const MAX_ATTEMPTS = 5;
const hash = (id: string, code: string) => createHash("sha256").update(`${id}:${code}`).digest("hex");
let seq = 0;
const newId = (p: string) => `${p}-${Date.now().toString(36)}${(seq++).toString(36)}${randomInt(36 ** 3).toString(36)}`;

const view = (r: PaymentAccountRecord): PaymentAccountView => ({
  id: r.id,
  purpose: r.purpose,
  kind: r.kind,
  label: r.label,
  masked: r.masked,
  holder: r.holder,
  status: r.status,
  isDefault: r.isDefault,
  assetIds: r.assetIds,
  createdAt: r.createdAt,
  verifiedAt: r.verifiedAt,
  warning: r.warning,
  expiry: r.expiry,
});

/**
 * Comptes de paiement : ajout (en attente), vérification par code, puis toute modification ou
 * suppression confirmée par un nouveau code. Le numéro complet ne ressort jamais.
 */
export class PaymentAccountsService {
  private challenges = new Map<string, Challenge>();

  constructor(
    private readonly store: PaymentAccountStore,
    private readonly sms: CodeSender = new SimulatedCodeSender(),
    private readonly ownerName: (ownerId: string) => string | undefined = () => undefined,
    private readonly now: () => number = () => Date.now(),
    private readonly cards: CardProvider = new SimulatedCardProvider(),
  ) {}

  /**
   * Carte pour l'abonnement : le jeton du prestataire est échangé contre une carte réutilisable.
   * Elle remplace le moyen de paiement précédent de l'abonnement. Pas de code SMS : la banque
   * authentifie le porteur (3-D Secure) et la carte ne sert qu'à payer Keyo, jamais à recevoir.
   */
  async addCard(ownerId: string, raw: unknown) {
    const token = (raw as { token?: unknown } | null)?.token;
    if (typeof token !== "string" || token.length > 500) throw new PaymentError("Jeton de carte manquant.");
    let card;
    try {
      card = await this.cards.resolve(token);
    } catch (e) {
      throw new PaymentError(e instanceof CardError ? e.message : "Le prestataire de paiement est injoignable.", e instanceof CardError ? 400 : 502);
    }
    const today = new Date(this.now()).toISOString().slice(0, 10);
    if (cardExpired(card.expMonth, card.expYear, today)) throw new PaymentError("Cette carte est expirée.");
    const all = await this.store.all(ownerId);
    const fp = fingerprint(`card:${card.ref}`);
    const rec: PaymentAccountRecord = {
      id: newId("pa"),
      purpose: "SUBSCRIPTION",
      kind: "CARD",
      sealed: seal(card.ref),
      fingerprint: fp,
      label: CARD_BRAND_LABEL[card.brand],
      masked: `•••• ${card.last4}`,
      expiry: `${String(card.expMonth).padStart(2, "0")}/${String(card.expYear).slice(-2)}`,
      holder: this.ownerName(ownerId) ?? "Titulaire de la carte",
      status: "VERIFIED",
      isDefault: true,
      assetIds: [],
      createdAt: new Date(this.now()).toISOString(),
      verifiedAt: new Date(this.now()).toISOString(),
    };
    const next = [...all.filter((x) => x.purpose !== "SUBSCRIPTION"), rec];
    await this.store.save(ownerId, next);
    return { account: view(rec), accounts: next.map(view), simulated: this.cards.simulated };
  }

  async list(ownerId: string) {
    return (await this.store.all(ownerId)).map(view);
  }

  /** Le bien a-t-il un compte de réception vérifié ? (liens de paiement, contrôle de gestion) */
  async receivingFor(ownerId: string, assetId: string) {
    return receivingAccountFor(await this.list(ownerId), assetId);
  }

  async create(ownerId: string, raw: unknown) {
    const r = NewPaymentAccount.safeParse(raw);
    if (!r.success) throw new PaymentError(r.error.issues[0]?.message ?? "Compte invalide");
    const a = r.data;
    const secret = a.kind === "MOBILE_MONEY" ? a.phone : a.iban.replace(/\s+/g, "").toUpperCase();
    const fp = fingerprint(secret);
    const all = await this.store.all(ownerId);
    if (all.some((x) => x.fingerprint === fp && x.purpose === a.purpose && x.status !== "REJECTED")) throw new PaymentError("Ce compte est déjà enregistré.", 409);
    if (all.length >= 20) throw new PaymentError("Nombre maximal de comptes atteint.");
    const { label, masked } = maskAccount(a.kind === "MOBILE_MONEY" ? a : { kind: "BANK", bankName: a.bankName, iban: secret });
    const rec: PaymentAccountRecord = {
      id: newId("pa"),
      purpose: a.purpose,
      kind: a.kind,
      operator: a.kind === "MOBILE_MONEY" ? a.operator : undefined,
      bankName: a.kind === "BANK" ? a.bankName : undefined,
      sealed: seal(secret),
      fingerprint: fp,
      label,
      masked,
      holder: a.holder,
      status: "PENDING",
      isDefault: a.isDefault,
      assetIds: a.assetIds,
      createdAt: new Date(this.now()).toISOString(),
    };
    await this.store.save(ownerId, [...all, rec]);
    // Mobile Money : le code part sur le numéro de réception (preuve qu'il appartient au propriétaire).
    const challenge = await this.challenge(ownerId, rec, { op: "VERIFY" }, a.kind === "MOBILE_MONEY" ? a.phone : undefined);
    return { account: view(rec), challenge };
  }

  /** Demande un code pour vérifier, modifier ou supprimer un compte. */
  async requestChange(ownerId: string, accountId: string, raw: unknown) {
    const r = ChangeRequest.safeParse(raw);
    if (!r.success) throw new PaymentError("Demande invalide");
    const rec = (await this.store.all(ownerId)).find((x) => x.id === accountId);
    if (!rec) throw new PaymentError("Compte introuvable.", 404);
    if (r.data.op === "VERIFY" && rec.status !== "PENDING") throw new PaymentError("Ce compte n'est pas en attente de vérification.");
    return this.challenge(ownerId, rec, r.data);
  }

  async confirm(ownerId: string, challengeId: string, code: string) {
    const c = this.challenges.get(challengeId);
    if (!c || c.ownerId !== ownerId) throw new PaymentError("Code expiré ou inconnu : demandez-en un nouveau.", 404);
    if (this.now() > c.expiresAt) {
      this.challenges.delete(challengeId);
      throw new PaymentError("Code expiré : demandez-en un nouveau.", 410);
    }
    if (hash(c.id, code.trim()) !== c.codeHash) {
      c.attempts++;
      if (c.attempts >= MAX_ATTEMPTS) this.challenges.delete(challengeId);
      throw new PaymentError(c.attempts >= MAX_ATTEMPTS ? "Trop d'essais : demandez un nouveau code." : "Code incorrect.", 403);
    }
    this.challenges.delete(challengeId);
    const all = await this.store.all(ownerId);
    const rec = all.find((x) => x.id === c.accountId);
    if (!rec) throw new PaymentError("Compte introuvable.", 404);
    let next = all;
    if (c.change.op === "DELETE") next = all.filter((x) => x.id !== rec.id);
    else if (c.change.op === "VERIFY") {
      rec.status = "VERIFIED";
      rec.verifiedAt = new Date(this.now()).toISOString();
      const owner = this.ownerName(ownerId);
      if (owner && !holderMatches(rec.holder, owner)) rec.warning = `Titulaire « ${rec.holder} » différent de votre nom : les loyers iront à cette personne.`;
      if (rec.purpose === "SUBSCRIPTION") next = all.filter((x) => x.purpose !== "SUBSCRIPTION" || x.id === rec.id);
      else if (!all.some((x) => x.id !== rec.id && x.purpose === "RECEIVE" && x.status === "VERIFIED" && x.isDefault)) rec.isDefault = true;
    } else {
      if (c.change.patch.assetIds) rec.assetIds = c.change.patch.assetIds;
      if (c.change.patch.isDefault !== undefined) rec.isDefault = c.change.patch.isDefault;
    }
    // Un seul compte par défaut par usage.
    if (rec.isDefault && c.change.op !== "DELETE") for (const x of next) if (x.id !== rec.id && x.purpose === rec.purpose) x.isDefault = false;
    await this.store.save(ownerId, next);
    return { op: c.change.op, accounts: next.map(view) };
  }

  /** Suppression du compte : retire tous les comptes de paiement enregistrés (chiffrés). */
  async forget(ownerId: string) {
    const n = (await this.store.all(ownerId)).length;
    await this.store.save(ownerId, []);
    for (const [id, c] of this.challenges) if (c.ownerId === ownerId) this.challenges.delete(id);
    return n;
  }

  private async challenge(ownerId: string, rec: PaymentAccountRecord, change: ChangeRequest, to?: string): Promise<ChallengeView> {
    const id = newId("ch");
    const code = this.sms.simulated ? SIMULATED_CODE : String(randomInt(1_000_000)).padStart(6, "0");
    this.challenges.set(id, { id, ownerId, accountId: rec.id, change, codeHash: hash(id, code), expiresAt: this.now() + TTL_MS, attempts: 0 });
    const what = change.op === "VERIFY" ? "vérifier" : change.op === "DELETE" ? "supprimer" : "modifier";
    // Hors Mobile Money, le code part sur le numéro du propriétaire (son identifiant de connexion).
    const dest = to ?? ownerId;
    await this.sms.send(dest, `Keyo : code ${code} pour ${what} le compte ${rec.label} ${rec.masked}. Ne le communiquez à personne.`);
    return { challengeId: id, sentTo: to ? `${rec.label} ${rec.masked}` : "votre numéro de téléphone", simulated: this.sms.simulated, expiresInSeconds: TTL_MS / 1000 };
  }
}
