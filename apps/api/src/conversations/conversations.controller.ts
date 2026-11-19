import { Body, Controller, Delete, Get, Headers, HttpException, HttpStatus, Inject, Param, Put } from "@nestjs/common";
import { owner } from "../owner.ts";
import { Conversation, type ConversationStore } from "./store.ts";

export const CONVERSATION_STORE = Symbol("CONVERSATION_STORE");

/** Conversations du chat, synchronisées par l'app. */
@Controller("conversations")
export class ConversationsController {
  constructor(@Inject(CONVERSATION_STORE) private readonly store: ConversationStore) {}

  @Get()
  list(@Headers("x-keyo-owner") id: string, @Headers("authorization") auth: string) {
    return this.store.list(owner(id, auth));
  }

  @Get(":conversationId")
  async get(@Headers("x-keyo-owner") id: string, @Headers("authorization") auth: string, @Param("conversationId") cid: string) {
    const c = await this.store.get(owner(id, auth), cid);
    if (!c) throw new HttpException({ error: "Conversation introuvable" }, HttpStatus.NOT_FOUND);
    return c;
  }

  @Put(":conversationId")
  async put(@Headers("x-keyo-owner") id: string, @Headers("authorization") auth: string, @Param("conversationId") cid: string, @Body() body: unknown) {
    const o = owner(id, auth);
    const r = Conversation.safeParse(body);
    if (!r.success || r.data.id !== cid) throw new HttpException({ error: "Conversation invalide" }, HttpStatus.BAD_REQUEST);
    await this.store.put(o, r.data);
    return { ok: true };
  }

  @Delete(":conversationId")
  async remove(@Headers("x-keyo-owner") id: string, @Headers("authorization") auth: string, @Param("conversationId") cid: string) {
    await this.store.remove(owner(id, auth), cid);
    return { ok: true };
  }
}
