import { Router } from "express";
import { answer, catchUp } from "../rag/answer.js";
import { db } from "../db/index.js";
const router = Router();
router.post("/chat", async (req, res) => {
  try {
    const { question, channel } = req.body;
    if (!question) return res.status(400).json({ error: "question required" });
    res.json(await answer(question, channel));
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});
router.post("/catchup", async (req, res) => {
  try {
    res.json(await catchUp(new Date(req.body.since), req.body.channel));
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});
router.get("/stats", (_req, res) =>
  res.json(db.prepare("SELECT channel,COUNT(*) count FROM messages GROUP BY channel").all()),
);
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
export default router;
