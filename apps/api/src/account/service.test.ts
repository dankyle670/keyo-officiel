import assert from "node:assert/strict";
import { test } from "node:test";
import { MemoryAgentStore } from "../autonomous/store.ts";
import { SimulatedBillingProvider } from "../billing/provider.ts";
import { BillingService } from "../billing/service.ts";
import { MemoryBillingStore } from "../billing/store.ts";
import { MemoryConversationStore } from "../conversations/store.ts";
import { PaymentAccountsService, SimulatedCodeSender } from "../payments/service.ts";
import { MemoryPaymentAccountStore } from "../payments/store.ts";
import { AccountService } from "./service.ts";

const O = "user-2250700000001";

function setup() {
  const agents = new MemoryAgentStore();
  const conversations = new MemoryConversationStore();
  const payments = new PaymentAccountsService(new MemoryPaymentAccountStore());
  const billing = new BillingService({ store: new MemoryBillingStore(), provider: new SimulatedBillingProvider(), snapshot: () => undefined, accounts: (o) => payments.list(o) });
  const svc = new AccountService({ sms: new SimulatedCodeSender(), conversations, payments, billing, agents });
  return { agents, conversations, payments, billing, svc };
}

test("suppression du compte : code exigé, puis tout est effacé et l'abonnement s'arrête", async () => {
  const t = setup();
  await t.billing.ensure(O);
  await t.conversations.put(O, { id: "c1", title: "Bonjour", updatedAt: "2026-11-21T08:00:00Z", history: [], feed: [] } as never);
  await t.conversations.put("autre", { id: "c2", title: "Autre", updatedAt: "2026-11-21T08:00:00Z", history: [], feed: [] } as never);
  t.agents.putPolicy(O, t.agents.getPolicy(O));

  const ch = await t.svc.requestDeletion(O);
  await assert.rejects(t.svc.confirmDeletion(O, ch.challengeId, "000000"), /Code incorrect/);
  await assert.rejects(t.svc.confirmDeletion("autre", ch.challengeId, "123456"), /introuvable/);
  const r = await t.svc.confirmDeletion(O, ch.challengeId, "123456");

  assert.equal(r.conversations, 1);
  assert.deepEqual(await t.conversations.list(O), []);
  assert.equal((await t.conversations.list("autre")).length, 1, "les autres propriétaires ne sont pas touchés");
  assert.equal((await t.billing.view(O)).status, "CANCELED");
  // Le code ne sert qu'une fois.
  await assert.rejects(t.svc.confirmDeletion(O, ch.challengeId, "123456"), /introuvable/);
});
