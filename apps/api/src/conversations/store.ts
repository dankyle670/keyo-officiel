import type { Redis } from "ioredis";
import { z } from "zod";

/**
 * Conversations du chat de l'agent, gardées côté serveur : elles survivent à un changement de
 * téléphone, et l'équipe peut les relire pour améliorer l'agent. Stockage Redis (persisté sur
 * disque), ou mémoire sans REDIS_URL. PostgreSQL prendra le relais avec la même interface.
 */
export const Conversation = z.object({
  id: z.string().regex(/^[\w-]{1,80}$/),
  title: z.string().max(200),
  updatedAt: z.iso.datetime({ offset: true }),
  feed: z.array(z.record(z.string(), z.unknown())).max(400),
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.union([z.string(), z.array(z.record(z.string(), z.unknown()))]) })).max(2000),
  pending: z.unknown().optional(),
  attachments: z.record(z.string(), z.unknown()).optional(),
});
export type Conversation = z.infer<typeof Conversation>;
export type ConversationSummary = { id: string; title: string; updatedAt: string; messages: number };

const MAX_PER_OWNER = 200;

/**
 * Les photos et PDF (base64) ne sont pas gardés sur le serveur : ils sont remplacés par une mention.
 * L'agent les a déjà lus ; l'historique reste valide pour les tours suivants et beaucoup plus léger.
 */
export function stripBinaries(c: Conversation): Conversation {
  const history = c.history.map((m) =>
    typeof m.content === "string"
      ? m
      : {
          ...m,
          content: m.content.map((b) => {
            const src = b.source as { type?: string } | undefined;
            if ((b.type === "image" || b.type === "document") && src?.type === "base64") {
              return { type: "text", text: `[${b.type === "image" ? "Photo" : "PDF"} déjà transmise à l'agent, non conservée sur le serveur]` };
            }
            return b;
          }),
        },
  );
  return { ...c, history };
}

const summary = (c: Conversation): ConversationSummary => ({ id: c.id, title: c.title, updatedAt: c.updatedAt, messages: c.feed.filter((f) => f.kind === "user" || f.kind === "agent").length });

export interface ConversationStore {
  list(ownerId: string): Promise<ConversationSummary[]>;
  get(ownerId: string, id: string): Promise<Conversation | undefined>;
  put(ownerId: string, c: Conversation): Promise<void>;
  remove(ownerId: string, id: string): Promise<void>;
  /** Tous les propriétaires ayant des conversations (relecture par l'équipe). */
  owners(): Promise<string[]>;
}

export class MemoryConversationStore implements ConversationStore {
  private data = new Map<string, Map<string, Conversation>>();
  private of = (o: string) => this.data.get(o) ?? this.data.set(o, new Map()).get(o)!;
  async list(o: string) {
    return [...this.of(o).values()].map(summary).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  async get(o: string, id: string) {
    return this.of(o).get(id);
  }
  async put(o: string, c: Conversation) {
    const m = this.of(o);
    m.set(c.id, stripBinaries(c));
    if (m.size > MAX_PER_OWNER) {
      const oldest = [...m.values()].sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))[0]!;
      m.delete(oldest.id);
    }
  }
  async remove(o: string, id: string) {
    this.of(o).delete(id);
  }
  async owners() {
    return [...this.data.keys()].filter((o) => this.of(o).size > 0);
  }
}

/** Une clé par conversation, et un index trié par date de mise à jour pour chaque propriétaire. */
export class RedisConversationStore implements ConversationStore {
  constructor(private readonly redis: Redis) {}
  private key = (o: string, id: string) => `keyo:conv:${o}:${id}`;
  private index = (o: string) => `keyo:convs:${o}`;

  async list(o: string) {
    const ids = await this.redis.zrevrange(this.index(o), 0, MAX_PER_OWNER - 1);
    if (!ids.length) return [];
    const raw = await this.redis.mget(ids.map((id) => this.key(o, id)));
    return raw.flatMap((r) => (r ? [summary(JSON.parse(r) as Conversation)] : []));
  }
  async get(o: string, id: string) {
    const r = await this.redis.get(this.key(o, id));
    return r ? (JSON.parse(r) as Conversation) : undefined;
  }
  async put(o: string, c: Conversation) {
    await this.redis
      .multi()
      .set(this.key(o, c.id), JSON.stringify(stripBinaries(c)))
      .zadd(this.index(o), Date.parse(c.updatedAt), c.id)
      .sadd("keyo:conv-owners", o)
      .exec();
    const extra = (await this.redis.zcard(this.index(o))) - MAX_PER_OWNER;
    if (extra > 0) {
      const old = await this.redis.zrange(this.index(o), 0, extra - 1);
      await this.redis.multi().del(...old.map((id) => this.key(o, id))).zrem(this.index(o), ...old).exec();
    }
  }
  async remove(o: string, id: string) {
    await this.redis.multi().del(this.key(o, id)).zrem(this.index(o), id).exec();
  }
  async owners() {
    return this.redis.smembers("keyo:conv-owners");
  }
}
