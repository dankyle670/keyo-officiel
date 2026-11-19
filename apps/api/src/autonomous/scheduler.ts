import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { Queue, Worker } from "bullmq";
import { Redis } from "ioredis";
import { Orchestrator } from "./orchestrator.ts";
import { AGENT_STORE } from "./tokens.ts";
import type { AgentStore, Trigger } from "./store.ts";

type Job = { trigger: Trigger; ownerId?: string; note?: string };
const QUEUE = "keyo-autonomous";
/** Heures en temps universel, qui est l'heure d'Abidjan et de Dakar. */
const CRONS: { id: string; pattern: string; trigger: Trigger }[] = [
  { id: "daily", pattern: "0 9 * * *", trigger: "DAILY" },
  { id: "weekly", pattern: "0 8 * * 1", trigger: "WEEKLY" },
  { id: "monthly", pattern: "0 8 1 * *", trigger: "MONTHLY" },
];

/**
 * Déclencheurs des agents autonomes : horaires (chaque jour, chaque semaine, chaque mois) et
 * événements (paiement reçu, incident signalé, logement libéré).
 * Avec REDIS_URL : BullMQ (file durable, reprise après redémarrage). Sans : minuterie en mémoire,
 * pour le développement. KEYO_SCHEDULER=off désactive les horaires (les événements restent traités).
 */
@Injectable()
export class AutonomousScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger("Agents");
  private redis?: Redis;
  private queue?: Queue<Job>;
  private worker?: Worker<Job>;
  private timer?: NodeJS.Timeout;
  private last: Record<string, string> = {};

  constructor(
    @Inject(Orchestrator) private readonly orchestrator: Orchestrator,
    @Inject(AGENT_STORE) private readonly store: AgentStore,
  ) {}

  async onModuleInit() {
    const url = process.env.REDIS_URL;
    const schedules = process.env.KEYO_SCHEDULER !== "off";
    if (url) {
      this.redis = new Redis(url, { maxRetriesPerRequest: null });
      this.queue = new Queue<Job>(QUEUE, { connection: this.redis });
      this.worker = new Worker<Job>(QUEUE, (job) => this.process(job.data), { connection: this.redis, concurrency: 2 });
      if (schedules) for (const c of CRONS) await this.queue.upsertJobScheduler(c.id, { pattern: c.pattern, tz: "UTC" }, { name: c.id, data: { trigger: c.trigger } });
      this.log.log("Déclencheurs : BullMQ (Redis)");
    } else if (schedules) {
      this.timer = setInterval(() => void this.tick(new Date()), 5 * 60_000);
      this.timer.unref();
      this.log.log("Déclencheurs : minuterie en mémoire (pas de REDIS_URL)");
    }
  }

  async onModuleDestroy() {
    clearInterval(this.timer);
    await this.worker?.close();
    await this.queue?.close();
    this.redis?.disconnect();
  }

  /** Événement métier pour un propriétaire : mis en file (Redis) ou traité tout de suite. */
  async emit(job: Job) {
    if (this.queue) await this.queue.add(job.trigger, job, { removeOnComplete: 500, removeOnFail: 500 });
    else void this.process(job).catch((e) => this.log.error(e));
  }

  private async process(job: Job) {
    const owners = job.ownerId ? [job.ownerId] : this.store.owners();
    for (const o of owners) {
      const run = await this.orchestrator.run(o, job.trigger, job.note);
      this.log.log(`${job.trigger} ${o} : ${run.status} — ${run.summary ?? ""}`);
    }
  }

  private async tick(now: Date) {
    const day = now.toISOString().slice(0, 10);
    const h = now.getUTCHours();
    const due = (key: string, ok: boolean) => ok && this.last[key] !== day && (this.last[key] = day);
    if (due("daily", h >= 9)) await this.process({ trigger: "DAILY" });
    if (due("weekly", h >= 8 && now.getUTCDay() === 1)) await this.process({ trigger: "WEEKLY" });
    if (due("monthly", h >= 8 && now.getUTCDate() === 1)) await this.process({ trigger: "MONTHLY" });
  }
}
