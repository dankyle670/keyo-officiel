import { Body, Controller, Headers, HttpException, Inject, Post } from "@nestjs/common";
import { owner } from "../owner.ts";
import { AccountError, AccountService } from "./service.ts";

const wrap = async <T>(p: Promise<T>) => {
  try {
    return await p;
  } catch (e) {
    if (e instanceof AccountError) throw new HttpException({ error: e.message }, e.status);
    throw e;
  }
};

/** Compte du propriétaire : suppression, confirmée par code SMS. */
@Controller("account")
export class AccountController {
  constructor(@Inject(AccountService) private readonly account: AccountService) {}

  @Post("delete/request")
  request(@Headers("x-keyo-owner") id: string, @Headers("authorization") auth: string) {
    return wrap(this.account.requestDeletion(owner(id, auth)));
  }

  @Post("delete/confirm")
  confirm(@Headers("x-keyo-owner") id: string, @Headers("authorization") auth: string, @Body() body: { challengeId?: unknown; code?: unknown }) {
    if (typeof body?.challengeId !== "string" || typeof body?.code !== "string") throw new HttpException({ error: "Code manquant." }, 400);
    return wrap(this.account.confirmDeletion(owner(id, auth), body.challengeId, body.code));
  }
}
