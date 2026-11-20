import { Body, Controller, Get, Header, Headers, HttpException, HttpStatus, Inject, Param, Post, StreamableFile } from "@nestjs/common";
import { PLANS } from "@keyo/shared";
import { owner } from "../owner.ts";
import { SimulatedBillingProvider, type BillingProvider } from "./provider.ts";
import { BillingError, BillingService } from "./service.ts";

export const BILLING_PROVIDER = Symbol("BILLING_PROVIDER");

const wrap = async <T>(p: Promise<T>) => {
  try {
    return await p;
  } catch (e) {
    if (e instanceof BillingError) throw new HttpException({ error: e.message }, e.status);
    throw e;
  }
};

/** Abonnement Keyo : formule, échéances, paiement, reçus. */
@Controller("billing")
export class BillingController {
  constructor(
    @Inject(BillingService) private readonly billing: BillingService,
    @Inject(BILLING_PROVIDER) private readonly provider: BillingProvider,
  ) {}

  @Get()
  view(@Headers("x-keyo-owner") id: string, @Headers("authorization") auth: string) {
    return wrap(this.billing.view(owner(id, auth)));
  }

  @Get("plans")
  plans() {
    return PLANS;
  }

  @Get("invoices")
  invoices(@Headers("x-keyo-owner") id: string, @Headers("authorization") auth: string) {
    return wrap(this.billing.invoices(owner(id, auth)));
  }

  @Get("invoices/:invoiceId/receipt")
  @Header("content-type", "application/pdf")
  async receipt(@Headers("x-keyo-owner") id: string, @Headers("authorization") auth: string, @Param("invoiceId") invoiceId: string) {
    const r = await wrap(this.billing.receipt(owner(id, auth), invoiceId));
    return new StreamableFile(r.pdf, { type: "application/pdf", disposition: `attachment; filename="${r.filename}"` });
  }

  @Post("period")
  period(@Headers("x-keyo-owner") id: string, @Headers("authorization") auth: string, @Body() body: { period?: unknown }) {
    if (body?.period !== "MONTHLY" && body?.period !== "YEARLY") throw new HttpException({ error: "Périodicité invalide." }, HttpStatus.BAD_REQUEST);
    return wrap(this.billing.setPeriod(owner(id, auth), body.period));
  }

  @Post("cancel")
  cancel(@Headers("x-keyo-owner") id: string, @Headers("authorization") auth: string, @Body() body: { cancel?: unknown }) {
    return wrap(this.billing.cancel(owner(id, auth), body?.cancel !== false));
  }

  @Post("pay")
  pay(@Headers("x-keyo-owner") id: string, @Headers("authorization") auth: string) {
    return wrap(this.billing.payNow(owner(id, auth)));
  }

  @Get("attempts/:attemptId")
  attempt(@Headers("x-keyo-owner") id: string, @Headers("authorization") auth: string, @Param("attemptId") attemptId: string) {
    return wrap(this.billing.attemptStatus(owner(id, auth), attemptId));
  }

  /**
   * Démonstration uniquement (prestataire simulé) : le propriétaire valide ou refuse la demande
   * Mobile Money comme il le ferait avec son code. Le résultat passe par le webhook signé.
   */
  @Post("attempts/:attemptId/simulate")
  async simulate(@Headers("x-keyo-owner") id: string, @Headers("authorization") auth: string, @Param("attemptId") attemptId: string, @Body() body: { approve?: unknown }) {
    if (!(this.provider instanceof SimulatedBillingProvider)) throw new HttpException({ error: "Indisponible." }, HttpStatus.NOT_FOUND);
    const a = await wrap(this.billing.attemptStatus(owner(id, auth), attemptId));
    const ref = await wrap(this.billing.providerRefOf(attemptId));
    await this.provider.emit({ providerRef: ref, status: body?.approve === false ? "FAILED" : "SUCCEEDED", reason: body?.approve === false ? "Paiement refusé sur le téléphone." : undefined });
    return wrap(this.billing.attemptStatus(owner(id, auth), a.id));
  }

  /** Webhook du prestataire de paiement (signé) : seule source du statut « payé ». */
  @Post("webhooks/provider")
  webhook(@Headers("x-keyo-signature") signature: string | undefined, @Body() body: unknown) {
    return wrap(this.billing.webhook(body, signature));
  }
}
