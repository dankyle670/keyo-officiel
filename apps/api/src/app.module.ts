import Anthropic from "@anthropic-ai/sdk";
import { Module } from "@nestjs/common";
import { AgentController } from "./agent/agent.controller.ts";
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

@Module({
  controllers: [AgentController, AutonomousController, ConversationsController],
  providers: [
    AgentService,
    // Sans clé, l'agent répond en mode démo (côté app) : rien ne casse en développement.
    { provide: ANTHROPIC, useFactory: () => (process.env.ANTHROPIC_API_KEY ? new Anthropic() : null) },
    // Agents autonomes. Stockage en mémoire pour l'instant (PostgreSQL ensuite, même interface).
    { provide: AGENT_STORE, useFactory: () => new MemoryAgentStore() },
    { provide: ConnectorRegistry, useFactory: () => new ConnectorRegistry() },
    { provide: ActionGate, inject: [AGENT_STORE, ConnectorRegistry], useFactory: (s: AgentStore, c: ConnectorRegistry) => new ActionGate(s, c) },
    { provide: Orchestrator, inject: [AGENT_STORE, ActionGate, ANTHROPIC], useFactory: (s: AgentStore, g: ActionGate, a: Anthropic | null) => new Orchestrator(s, g, a) },
    AutonomousScheduler,
    // Conversations du chat : Redis (persisté sur disque) si REDIS_URL, sinon mémoire.
    { provide: CONVERSATION_STORE, useFactory: () => (process.env.REDIS_URL ? new RedisConversationStore(new Redis(process.env.REDIS_URL)) : new MemoryConversationStore()) },
  ],
})
export class AppModule {}
