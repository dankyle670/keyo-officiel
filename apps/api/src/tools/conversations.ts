import { Redis } from "ioredis";
import { RedisConversationStore } from "../conversations/store.ts";

/**
 * Relecture des conversations du chat, pour l'équipe (améliorer les réponses de l'agent).
 *   pnpm --filter @keyo/api conversations              liste par propriétaire
 *   pnpm --filter @keyo/api conversations <id>         une conversation en clair
 */
const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");
const store = new RedisConversationStore(redis);
const wanted = process.argv[2];

for (const o of await store.owners()) {
  for (const s of await store.list(o)) {
    if (wanted && s.id !== wanted) continue;
    console.log(`\n=== ${s.title}  (${s.id}, propriétaire ${o}, ${s.updatedAt.slice(0, 16).replace("T", " ")}, ${s.messages} messages)`);
    if (!wanted) continue;
    const c = (await store.get(o, s.id))!;
    for (const f of c.feed) {
      const t = f as Record<string, any>;
      if (t.kind === "user") console.log(`\n[PROPRIÉTAIRE] ${t.text}`);
      else if (t.kind === "agent") console.log(`\n[KEYO] ${t.text}`);
      else if (t.kind === "activity") console.log(`  · ${t.label}`);
      else if (t.kind === "proposal") console.log(`  [CARTE ${t.status}] ${t.description}${t.result ? ` → ${t.result}` : ""}`);
      else if (t.kind === "error") console.log(`  [ERREUR] ${t.text}`);
    }
  }
}
redis.disconnect();
