import Anthropic from "@anthropic-ai/sdk";
import { Body, Controller, Get, HttpException, HttpStatus, Inject, Post } from "@nestjs/common";
import { AgentService, OpsBody, TurnBody } from "./agent.service.ts";

const parse = <T>(schema: { safeParse: (v: unknown) => { success: true; data: T } | { success: false } }, body: unknown): T => {
  const r = schema.safeParse(body);
  if (!r.success) throw new HttpException({ error: "Requête invalide" }, HttpStatus.BAD_REQUEST);
  return r.data;
};

/** Erreurs de l'API Claude traduites pour l'app (sans jamais renvoyer la clé ni le détail brut). */
function rethrow(e: unknown): never {
  if (e instanceof Anthropic.RateLimitError) throw new HttpException({ error: "L'agent est très sollicité, réessayez dans un instant." }, HttpStatus.TOO_MANY_REQUESTS);
  if (e instanceof Anthropic.AuthenticationError) throw new HttpException({ error: "Clé de l'agent invalide côté serveur." }, HttpStatus.SERVICE_UNAVAILABLE);
  if (e instanceof Anthropic.BadRequestError) throw new HttpException({ error: "Conversation trop longue ou invalide, recommencez une conversation." }, HttpStatus.BAD_REQUEST);
  if (e instanceof Anthropic.APIError) throw new HttpException({ error: "L'agent est momentanément indisponible." }, HttpStatus.BAD_GATEWAY);
  throw e;
}

@Controller("agent")
export class AgentController {
  constructor(@Inject(AgentService) private readonly agent: AgentService) {}

  @Get("status")
  status() {
    return this.agent.status();
  }

  @Post("turn")
  async turn(@Body() body: unknown) {
    const res = await this.agent.turn(parse(TurnBody, body)).catch(rethrow);
    if (!res) throw new HttpException({ mode: "demo" }, HttpStatus.SERVICE_UNAVAILABLE);
    return res;
  }

  @Post("ops")
  async ops(@Body() body: unknown) {
    const res = await this.agent.ops(parse(OpsBody, body)).catch(rethrow);
    if (!res) throw new HttpException({ mode: "demo" }, HttpStatus.SERVICE_UNAVAILABLE);
    return res;
  }
}
