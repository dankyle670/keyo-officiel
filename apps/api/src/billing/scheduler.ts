import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { BillingService } from "./service.ts";

/**
 * Échéances de l'abonnement : toutes les heures (et au démarrage), chaque abonnement passe par
 * nextBillingAction. Idempotent : relancer un passage ne facture jamais deux fois.
 * KEYO_SCHEDULER=off le désactive. Une seule instance de l'API pour l'instant ; avec plusieurs,
 * passer par une file BullMQ comme les agents autonomes.
 */
@Injectable()
export class BillingScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger("Abonnement");
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(@Inject(BillingService) private readonly billing: BillingService) {}

  onModuleInit() {
    if (process.env.KEYO_SCHEDULER === "off") return;
    const run = async () => {
      if (this.running) return;
      this.running = true;
      try {
        await this.billing.tick();
      } catch (e) {
        this.log.warn(`Passage échoué : ${e instanceof Error ? e.message : e}`);
      } finally {
        this.running = false;
      }
    };
    setTimeout(() => void run(), 10_000).unref();
    this.timer = setInterval(() => void run(), 60 * 60_000);
    this.timer.unref();
  }

  onModuleDestroy() {
    clearInterval(this.timer);
  }
}
