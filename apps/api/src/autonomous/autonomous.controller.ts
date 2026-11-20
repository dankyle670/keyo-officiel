import { Body, Controller, Get, Headers, HttpException, HttpStatus, Inject, Param, Post, Put, Query } from "@nestjs/common";
import { z } from "zod";
import { actionDef, AUTONOMOUS_ACTION_KEYS, AutonomyPolicy, levelOf, SPECIALIST_LABEL } from "@keyo/shared";
import { ConnectorRegistry } from "./connectors.ts";
import { ActionGate, type GateOutcome } from "./gate.ts";
import { Orchestrator } from "./orchestrator.ts";
import { AutonomousScheduler } from "./scheduler.ts";
import { OwnerSnapshot, type ActionStatus, type AgentStore } from "./store.ts";
import { AGENT_STORE } from "./tokens.ts";
import { owner } from "../owner.ts";

const RunBody = z.object({ trigger: z.enum(["DAILY", "WEEKLY", "MONTHLY", "MANUAL"]).default("MANUAL"), note: z.string().max(300).optional() });
const EventBody = z.object({ type: z.enum(["PAYMENT_RECEIVED", "INCIDENT_REPORTED", "UNIT_VACATED"]), note: z.string().max(300).optional() });

const parse = <T>(schema: z.ZodType<T>, body: unknown): T => {
  const r = schema.safeParse(body);
  if (!r.success) throw new HttpException({ error: "Requête invalide", issues: r.error.issues.slice(0, 5).map((i) => `${i.path.join(".")} ${i.message}`) }, HttpStatus.BAD_REQUEST);
  return r.data;
};


const reply = (o: GateOutcome) => {
  if (o.status === "INVALID" || o.status === "DUPLICATE") throw new HttpException({ error: o.reason }, HttpStatus.CONFLICT);
  return o;
};

@Controller("autonomous")
export class AutonomousController {
  constructor(
    @Inject(AGENT_STORE) private readonly store: AgentStore,
    @Inject(ActionGate) private readonly gate: ActionGate,
    @Inject(Orchestrator) private readonly orchestrator: Orchestrator,
    @Inject(AutonomousScheduler) private readonly scheduler: AutonomousScheduler,
    @Inject(ConnectorRegistry) private readonly connectors: ConnectorRegistry,
  ) {}

  /** L'app envoie l'état de ses données (passerelle avant la synchronisation complète). */
  /** Données telles que le serveur les a reçues de l'app (relecture, diagnostic, futur changement de téléphone). */
  @Get("snapshot")
  getSnapshot(@Headers("x-keyo-owner") id: string, @Headers("authorization") auth: string) {
    const s = this.store.getSnapshot(owner(id, auth));
    if (!s) throw new HttpException({ error: "Aucune donnée reçue de l'app pour l'instant." }, HttpStatus.NOT_FOUND);
    return s;
  }

  @Put("snapshot")
  snapshot(@Headers("x-keyo-owner") id: string, @Headers("authorization") auth: string, @Body() body: unknown) {
    const o = owner(id, auth);
    const s = parse(OwnerSnapshot, body);
    this.store.putSnapshot(o, s);
    return { ok: true, assets: s.assets.length, schedule: s.schedule.length };
  }

  @Get("policy")
  policy(@Headers("x-keyo-owner") id: string, @Headers("authorization") auth: string) {
    return this.store.getPolicy(owner(id, auth));
  }

  @Put("policy")
  setPolicy(@Headers("x-keyo-owner") id: string, @Headers("authorization") auth: string, @Body() body: unknown) {
    const o = owner(id, auth);
    this.store.putPolicy(o, parse(AutonomyPolicy, body));
    return this.store.getPolicy(o);
  }

  /** Catalogue des actions avec le niveau effectif pour ce propriétaire. */
  @Get("catalog")
  catalog(@Headers("x-keyo-owner") id: string, @Headers("authorization") auth: string) {
    const policy = this.store.getPolicy(owner(id, auth));
    return AUTONOMOUS_ACTION_KEYS.map((key) => {
      const d = actionDef(key);
      return { key, label: d.label, description: d.description, specialist: d.specialist, specialistLabel: SPECIALIST_LABEL[d.specialist], level: levelOf(policy, key), maxLevel: d.maxLevel, spends: Boolean(d.spends), channels: d.channels };
    });
  }

  @Post("run")
  run(@Headers("x-keyo-owner") id: string, @Headers("authorization") auth: string, @Body() body: unknown) {
    const { trigger, note } = parse(RunBody, body ?? {});
    return this.orchestrator.run(owner(id, auth), trigger, note);
  }

  @Post("events")
  async event(@Headers("x-keyo-owner") id: string, @Headers("authorization") auth: string, @Body() body: unknown) {
    const { type, note } = parse(EventBody, body);
    await this.scheduler.emit({ ownerId: owner(id, auth), trigger: type, note });
    return { queued: true };
  }

  @Get("runs")
  runs(@Headers("x-keyo-owner") id: string, @Headers("authorization") auth: string) {
    return this.store.runs(owner(id, auth)).slice(0, 50);
  }

  /** Journal « Ce que Keyo a fait ». */
  @Get("journal")
  journal(@Headers("x-keyo-owner") id: string, @Headers("authorization") auth: string, @Query("status") status?: string) {
    return this.store.actions(owner(id, auth), status ? { status: status as ActionStatus } : undefined).slice(0, 200);
  }

  @Get("approvals")
  approvals(@Headers("x-keyo-owner") id: string, @Headers("authorization") auth: string) {
    return this.store.actions(owner(id, auth), { status: "PENDING_APPROVAL" });
  }

  @Post("actions/:actionId/approve")
  async approve(@Headers("x-keyo-owner") id: string, @Headers("authorization") auth: string, @Param("actionId") actionId: string) {
    return reply(await this.gate.approve(owner(id, auth), actionId));
  }

  @Post("actions/:actionId/reject")
  reject(@Headers("x-keyo-owner") id: string, @Headers("authorization") auth: string, @Param("actionId") actionId: string) {
    return reply(this.gate.reject(owner(id, auth), actionId));
  }

  @Post("actions/:actionId/undo")
  undo(@Headers("x-keyo-owner") id: string, @Headers("authorization") auth: string, @Param("actionId") actionId: string) {
    return reply(this.gate.undo(owner(id, auth), actionId));
  }

  @Get("messages")
  messages(@Headers("x-keyo-owner") id: string, @Headers("authorization") auth: string) {
    return this.store.messages(owner(id, auth)).slice(0, 200);
  }

  /** Modifications à appliquer par l'app (une seule fois : elles sont marquées comme récupérées). */
  @Post("mutations/pull")
  mutations(@Headers("x-keyo-owner") id: string, @Headers("authorization") auth: string) {
    return this.store.pullMutations(owner(id, auth));
  }

  @Get("connectors")
  connectorList(@Headers("x-keyo-owner") id: string, @Headers("authorization") auth: string) {
    owner(id, auth);
    return this.connectors.list();
  }
}
