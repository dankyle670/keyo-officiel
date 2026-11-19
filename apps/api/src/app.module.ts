import Anthropic from "@anthropic-ai/sdk";
import { Module } from "@nestjs/common";
import { AgentController } from "./agent/agent.controller.ts";
import { AgentService, ANTHROPIC } from "./agent/agent.service.ts";

@Module({
  controllers: [AgentController],
  providers: [
    AgentService,
    // Sans clé, l'agent répond en mode démo (côté app) : rien ne casse en développement.
    { provide: ANTHROPIC, useFactory: () => (process.env.ANTHROPIC_API_KEY ? new Anthropic() : null) },
  ],
})
export class AppModule {}
