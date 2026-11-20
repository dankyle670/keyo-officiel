import type { Redis } from "ioredis";
import type { MobileMoneyOperator, PaymentAccountStatus, PaymentPurpose } from "@keyo/shared";

/** Compte enregistré : le numéro ou l'IBAN n'est conservé que chiffré (`sealed`). */
export type PaymentAccountRecord = {
  id: string;
  purpose: PaymentPurpose;
  kind: "MOBILE_MONEY" | "BANK" | "CARD";
  operator?: MobileMoneyOperator;
  /** Carte : « 08/28 » ; la référence du prestataire est dans `sealed`. */
  expiry?: string;
  bankName?: string;
  sealed: string;
  fingerprint: string;
  label: string;
  masked: string;
  holder: string;
  status: PaymentAccountStatus;
  isDefault: boolean;
  assetIds: string[];
  createdAt: string;
  verifiedAt?: string;
  warning?: string;
};

export interface PaymentAccountStore {
  all(ownerId: string): Promise<PaymentAccountRecord[]>;
  save(ownerId: string, accounts: PaymentAccountRecord[]): Promise<void>;
}

export class MemoryPaymentAccountStore implements PaymentAccountStore {
  private data = new Map<string, PaymentAccountRecord[]>();
  async all(o: string) {
    return structuredClone(this.data.get(o) ?? []);
  }
  async save(o: string, accounts: PaymentAccountRecord[]) {
    this.data.set(o, structuredClone(accounts));
  }
}

/** Une clé par propriétaire ; Redis est persisté sur disque. */
export class RedisPaymentAccountStore implements PaymentAccountStore {
  constructor(private readonly redis: Redis) {}
  async all(o: string) {
    const r = await this.redis.get(`keyo:payment-accounts:${o}`);
    return r ? (JSON.parse(r) as PaymentAccountRecord[]) : [];
  }
  async save(o: string, accounts: PaymentAccountRecord[]) {
    await this.redis.set(`keyo:payment-accounts:${o}`, JSON.stringify(accounts));
  }
}
