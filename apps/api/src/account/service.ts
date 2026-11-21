import { createHash, randomInt, randomUUID } from "node:crypto";
import type { AgentStore } from "../autonomous/store.ts";
import type { BillingService } from "../billing/service.ts";
import type { ConversationStore } from "../conversations/store.ts";
import { SIMULATED_CODE, type CodeSender, type PaymentAccountsService } from "../payments/service.ts";

/**
 * Suppression du compte, à la demande du propriétaire (exigée aussi par Apple et Google).
 * Confirmée par un code SMS. Efface les données du propriétaire sur le serveur : conversations,
 * comptes de paiement, données et journal des agents autonomes ; l'abonnement s'arrête tout de
 * suite. Les reçus déjà émis sont conservés, comme la loi l'impose pour la comptabilité.
 */
export class AccountError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

type Challenge = { id: string; ownerId: string; codeHash: string; expiresAt: number; attempts: number };
const TTL_MS = 5 * 60_000;
const MAX_ATTEMPTS = 5;
const hash = (id: string, code: string) => createHash("sha256").update(`${id}:${code}`).digest("hex");

export type DeletionReport = { conversations: number; paymentAccounts: number; subscriptionStopped: boolean; receiptsKept: number };

export class AccountService {
  private challenges = new Map<string, Challenge>();

  constructor(
    private readonly d: {
      sms: CodeSender;
      conversations: ConversationStore;
      payments: PaymentAccountsService;
      billing: BillingService;
      agents: AgentStore;
      now?: () => number;
    },
  ) {}

  private now() {
    return this.d.now?.() ?? Date.now();
  }

  /** Envoie le code de confirmation au numéro du propriétaire (son identifiant de connexion). */
  async requestDeletion(ownerId: string) {
    for (const [id, c] of this.challenges) if (c.ownerId === ownerId) this.challenges.delete(id);
    const id = randomUUID();
    const code = this.d.sms.simulated ? SIMULATED_CODE : String(randomInt(1_000_000)).padStart(6, "0");
    this.challenges.set(id, { id, ownerId, codeHash: hash(id, code), expiresAt: this.now() + TTL_MS, attempts: 0 });
    await this.d.sms.send(ownerId, `Keyo : code ${code} pour SUPPRIMER votre compte. Si vous n'êtes pas à l'origine de cette demande, ignorez ce message.`);
    return { challengeId: id, simulated: this.d.sms.simulated, expiresInSeconds: TTL_MS / 1000 };
  }

  async confirmDeletion(ownerId: string, challengeId: string, code: string): Promise<DeletionReport> {
    const c = this.challenges.get(challengeId);
    if (!c || c.ownerId !== ownerId) throw new AccountError("Demande introuvable : recommencez.", 404);
    if (c.expiresAt < this.now()) {
      this.challenges.delete(challengeId);
      throw new AccountError("Code expiré : demandez-en un nouveau.", 410);
    }
    if (hash(c.id, code.trim()) !== c.codeHash) {
      c.attempts++;
      if (c.attempts >= MAX_ATTEMPTS) this.challenges.delete(challengeId);
      throw new AccountError(c.attempts >= MAX_ATTEMPTS ? "Trop d'essais : demandez un nouveau code." : "Code incorrect.", 403);
    }
    this.challenges.delete(challengeId);

    // D'abord l'abonnement (plus aucun prélèvement), puis l'effacement.
    await this.d.billing.closeAccount(ownerId);
    const list = await this.d.conversations.list(ownerId);
    for (const conv of list) await this.d.conversations.remove(ownerId, conv.id);
    const paymentAccounts = await this.d.payments.forget(ownerId);
    this.d.agents.forget(ownerId);
    const receiptsKept = (await this.d.billing.invoices(ownerId)).filter((i) => i.status === "PAID").length;
    return { conversations: list.length, paymentAccounts, subscriptionStopped: true, receiptsKept };
  }
}
