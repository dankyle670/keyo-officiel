import { test } from "node:test";
import assert from "node:assert/strict";
import { Conversation, MemoryConversationStore, stripBinaries } from "./store.ts";

const conv = (id: string, updatedAt: string): Conversation =>
  Conversation.parse({
    id,
    title: `Conversation ${id}`,
    updatedAt,
    feed: [
      { id: "1", kind: "user", text: "Voici ma facture" },
      { id: "2", kind: "agent", text: "Je l'ai lue." },
    ],
    history: [
      { role: "user", content: [{ type: "image", source: { type: "base64", media_type: "image/jpeg", data: "AAAA" } }, { type: "text", text: "Voici ma facture" }] },
      { role: "assistant", content: [{ type: "text", text: "Je l'ai lue." }] },
    ],
    pending: null,
    attachments: {},
  });

test("les photos et PDF ne sont pas gardés sur le serveur, le reste de l'historique l'est", () => {
  const c = stripBinaries(conv("c1", "2026-11-19T10:00:00Z"));
  const blocks = c.history[0]!.content as Record<string, unknown>[];
  assert.equal(blocks[0]!.type, "text");
  assert.match(String(blocks[0]!.text), /Photo déjà transmise/);
  assert.deepEqual(blocks[1], { type: "text", text: "Voici ma facture" });
  assert.ok(!JSON.stringify(c).includes("AAAA"));
});

test("liste par propriétaire, la plus récente d'abord ; suppression ; propriétaires isolés", async () => {
  const s = new MemoryConversationStore();
  await s.put("o1", conv("a", "2026-11-18T10:00:00Z"));
  await s.put("o1", conv("b", "2026-11-19T10:00:00Z"));
  await s.put("o2", conv("c", "2026-11-19T11:00:00Z"));
  assert.deepEqual((await s.list("o1")).map((x) => x.id), ["b", "a"]);
  assert.equal((await s.list("o1"))[0]!.messages, 2);
  assert.equal(await s.get("o2", "a"), undefined);
  await s.remove("o1", "b");
  assert.deepEqual((await s.list("o1")).map((x) => x.id), ["a"]);
  assert.deepEqual((await s.owners()).sort(), ["o1", "o2"]);
});

test("une conversation invalide est refusée", () => {
  assert.equal(Conversation.safeParse({ id: "../x", title: "t", updatedAt: "2026-11-19T10:00:00Z", feed: [], history: [] }).success, false);
});
