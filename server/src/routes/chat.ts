import { Router } from "express";
import { requireUser } from "../auth.js";
import { answer, catchUp } from "../rag/answer.js";
import { db } from "../db/index.js";
import { provider } from "../llm/provider.js";
import { llmHealth } from "../llm/status.js";
const router = Router();
router.post("/chat", requireUser, async (req, res) => {
  try {
    const { question, channel, conversationId } = req.body;
    if (!question) return res.status(400).json({ error: "question required" });
    const result = await answer(question, channel);
    const response = saveTurn(req.user?.id, conversationId, question, result);
    res.json(response);
  } catch (e) {
    res.status(e instanceof Error && e.message === "conversation not found" ? 404 : 500).json({
      error: String(e),
    });
  }
});
router.post("/catchup", requireUser, async (req, res) => {
  try {
    const result = await catchUp(new Date(req.body.since), req.body.channel);
    const title = `Catch-up: last ${Math.max(
      1,
      Math.round((Date.now() - new Date(req.body.since).getTime()) / 864e5),
    )} days`;
    const response = saveTurn(req.user?.id, req.body.conversationId, title, result, title);
    res.json(response);
  } catch (e) {
    res.status(e instanceof Error && e.message === "conversation not found" ? 404 : 400).json({
      error: String(e),
    });
  }
});
router.get("/stats", (_req, res) =>
  res.json(db.prepare("SELECT channel,COUNT(*) count FROM messages GROUP BY channel").all()),
);
router.get("/health", (_req, res) => res.json({ ok: true, provider, llm: llmHealth() }));
router.get("/messages", (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200),
    channel = req.query.channel as string | undefined;
  res.json(
    db
      .prepare(
        `SELECT * FROM messages ${channel ? "WHERE channel=?" : ""} ORDER BY sent_at DESC LIMIT ?`,
      )
      .all(...(channel ? [channel, limit] : [limit])),
  );
});

export function saveTurn(
  userId: number | undefined,
  requestedConversationId: unknown,
  question: string,
  result: { answer: string; sources: unknown[] },
  title = question.slice(0, 60),
) {
  if (!userId) return result;
  const now = new Date().toISOString();
  let conversationId =
    requestedConversationId === undefined || requestedConversationId === null
      ? undefined
      : Number(requestedConversationId);
  if (conversationId !== undefined && !Number.isInteger(conversationId)) {
    throw new Error("conversation not found");
  }
  if (conversationId !== undefined) {
    const owned = db
      .prepare("SELECT id FROM conversations WHERE id=? AND user_id=?")
      .get(conversationId, userId);
    if (!owned) throw new Error("conversation not found");
  } else {
    const created = db
      .prepare(
        "INSERT INTO conversations(user_id,title,created_at,updated_at) VALUES(?,?,?,?) RETURNING id",
      )
      .get(userId, title, now, now) as { id: number };
    conversationId = created.id;
  }
  db.prepare(
    "INSERT INTO turns(conversation_id,question,answer,sources_json,created_at) VALUES(?,?,?,?,?)",
  ).run(conversationId, question, result.answer, JSON.stringify(result.sources), now);
  db.prepare("UPDATE conversations SET updated_at=? WHERE id=?").run(now, conversationId);
  return { ...result, conversationId };
}

export default router;
