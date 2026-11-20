import { Body, Controller, Get, Headers, HttpException, Inject, Param, Post } from "@nestjs/common";
import { owner } from "../owner.ts";
import { PaymentAccountsService, PaymentError } from "./service.ts";

const wrap = async <T>(p: Promise<T>) => {
  try {
    return await p;
  } catch (e) {
    if (e instanceof PaymentError) throw new HttpException({ error: e.message }, e.status);
    throw e;
  }
};

/** Comptes de paiement du propriétaire (réception des loyers, abonnement Keyo). */
@Controller("payment-accounts")
export class PaymentAccountsController {
  constructor(@Inject(PaymentAccountsService) private readonly svc: PaymentAccountsService) {}

  @Get()
  list(@Headers("x-keyo-owner") id: string, @Headers("authorization") auth: string) {
    return this.svc.list(owner(id, auth));
  }

  @Post()
  create(@Headers("x-keyo-owner") id: string, @Headers("authorization") auth: string, @Body() body: unknown) {
    return wrap(this.svc.create(owner(id, auth), body));
  }

  /** Carte de l'abonnement : jeton émis par le formulaire du prestataire, jamais le numéro. */
  @Post("cards")
  addCard(@Headers("x-keyo-owner") id: string, @Headers("authorization") auth: string, @Body() body: unknown) {
    return wrap(this.svc.addCard(owner(id, auth), body));
  }

  @Post(":accountId/changes")
  change(@Headers("x-keyo-owner") id: string, @Headers("authorization") auth: string, @Param("accountId") accountId: string, @Body() body: unknown) {
    return wrap(this.svc.requestChange(owner(id, auth), accountId, body));
  }

  @Post("challenges/:challengeId/confirm")
  confirm(@Headers("x-keyo-owner") id: string, @Headers("authorization") auth: string, @Param("challengeId") challengeId: string, @Body() body: { code?: unknown }) {
    return wrap(this.svc.confirm(owner(id, auth), challengeId, typeof body?.code === "string" ? body.code : ""));
  }
}
