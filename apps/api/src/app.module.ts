import Anthropic from "@anthropic-ai/sdk";
import { Module } from "@nestjs/common";
import { AgentController } from "./agent/agent.controller.ts";
import { ExportController } from "./export/export.controller.ts";
import { AccountController } from "./account/account.controller.ts";
import { AccountService } from "./account/service.ts";
import type { ConversationStore } from "./conversations/store.ts";
import { SimulatedCodeSender } from "./payments/service.ts";
import { AgentService, ANTHROPIC } from "./agent/agent.service.ts";
import { AutonomousController } from "./autonomous/autonomous.controller.ts";
import { ConnectorRegistry } from "./autonomous/connectors.ts";
import { ActionGate } from "./autonomous/gate.ts";
import { Orchestrator } from "./autonomous/orchestrator.ts";
import { AutonomousScheduler } from "./autonomous/scheduler.ts";
import { MemoryAgentStore, type AgentStore } from "./autonomous/store.ts";
import { AGENT_STORE } from "./autonomous/tokens.ts";
import { ConversationsController, CONVERSATION_STORE } from "./conversations/conversations.controller.ts";
import { MemoryConversationStore, RedisConversationStore } from "./conversations/store.ts";
import { Redis } from "ioredis";
import { PrismaPg } from "@prisma/adapter-pg";
import { BillingController, BILLING_PROVIDER } from "./billing/billing.controller.ts";
import { SimulatedBillingProvider, type BillingProvider } from "./billing/provider.ts";
import { BillingScheduler } from "./billing/scheduler.ts";
import { BillingService } from "./billing/service.ts";
import { MemoryBillingStore, PrismaBillingStore } from "./billing/store.ts";
import { costOf } from "./agent/router.ts";
import { PrismaClient } from "./generated/prisma/client.ts";
import { PaymentAccountsController } from "./payments/payments.controller.ts";
import { PaymentAccountsService } from "./payments/service.ts";
import { MemoryPaymentAccountStore, RedisPaymentAccountStore } from "./payments/store.ts";

@Module({
  controllers: [AgentController, AutonomousController, ConversationsController, PaymentAccountsController, BillingController, ExportController, AccountController],
  providers: [
    AgentService,
    // Sans clé, l'agent répond en mode démo (côté app) : rien ne casse en développement.
    { provide: ANTHROPIC, useFactory: () => (process.env.ANTHROPIC_API_KEY ? new Anthropic() : null) },
    // Agents autonomes. Stockage en mémoire pour l'instant (PostgreSQL ensuite, même interface).
    { provide: AGENT_STORE, useFactory: () => new MemoryAgentStore() },
    { provide: ConnectorRegistry, useFactory: () => new ConnectorRegistry() },
    // Comptes de paiement (réception des loyers, abonnement) : Redis si REDIS_URL, sinon mémoire.
    {
      provide: PaymentAccountsService,
      inject: [AGENT_STORE],
      useFactory: (s: AgentStore) =>
        new PaymentAccountsService(process.env.REDIS_URL ? new RedisPaymentAccountStore(new Redis(process.env.REDIS_URL)) : new MemoryPaymentAccountStore(), undefined, (o) => s.getSnapshot(o)?.ownerName),
    },
    {
      provide: ActionGate,
      inject: [AGENT_STORE, ConnectorRegistry, PaymentAccountsService],
      useFactory: (s: AgentStore, c: ConnectorRegistry, p: PaymentAccountsService) => {
        const gate = new ActionGate(s, c);
        gate.payoutReady = async (o, assetId) => Boolean(await p.receivingFor(o, assetId));
        return gate;
      },
    },
    // Abonnement : PostgreSQL si DATABASE_URL, sinon mémoire. Prestataire de paiement simulé pour l'instant.
    { provide: BILLING_PROVIDER, useFactory: () => new SimulatedBillingProvider() },
    {
      provide: BillingService,
      inject: [AGENT_STORE, PaymentAccountsService, BILLING_PROVIDER],
      useFactory: (s: AgentStore, p: PaymentAccountsService, provider: BillingProvider) => {
        const url = process.env.DATABASE_URL;
        const store = url ? new PrismaBillingStore(new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) })) : new MemoryBillingStore();
        const svc = new BillingService({ store, provider, snapshot: (o) => s.getSnapshot(o), accounts: (o) => p.list(o) });
        if (provider instanceof SimulatedBillingProvider) provider.deliver = (e, sig) => svc.webhook(e, sig);
        return svc;
      },
    },
    BillingScheduler,
    {
      provide: Orchestrator,
      inject: [AGENT_STORE, ActionGate, ANTHROPIC, BillingService],
      useFactory: (s: AgentStore, g: ActionGate, a: Anthropic | null, b: BillingService) => {
        const o = new Orchestrator(s, g, a);
        o.allowed = (ownerId) => b.agentAllowed(ownerId);
        o.onUsage = (ownerId, tier, res) => void b.recordUsage({ ownerId, kind: "autonomous", tier, model: res.model, ...costOf(tier, res.usage), expert: false, extraBilled: false }).catch(() => undefined);
        return o;
      },
    },
    AutonomousScheduler,
    // Conversations du chat : Redis (persisté sur disque) si REDIS_URL, sinon mémoire.
    { provide: CONVERSATION_STORE, useFactory: () => (process.env.REDIS_URL ? new RedisConversationStore(new Redis(process.env.REDIS_URL)) : new MemoryConversationStore()) },
    // Suppression du compte (code SMS simulé tant qu'aucun fournisseur n'est branché).
    {
      provide: AccountService,
      inject: [CONVERSATION_STORE, PaymentAccountsService, BillingService, AGENT_STORE],
      useFactory: (conversations: ConversationStore, payments: PaymentAccountsService, billing: BillingService, agents: AgentStore) => new AccountService({ sms: new SimulatedCodeSender(), conversations, payments, billing, agents }),
    },
  ],
})
export class AppModule {}
