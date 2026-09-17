import { Router } from "express";
import { requireUser } from "../auth.js";
import { db } from "../db/index.js";

const router = Router();
router.use(requireUser);

router.get("/", (req, res) => {
  if (!req.user) return res.status(401).json({ error: "login required" });
  res.json(
    db
      .prepare(
        `SELECT id,title,updated_at FROM conversations
         WHERE user_id=? ORDER BY updated_at DESC LIMIT 50`,
      )
      .all(req.user.id),
  );
});

router.get("/:id", (req, res) => {
  if (!req.user) return res.status(401).json({ error: "login required" });
  const conversation = db
    .prepare("SELECT id,title,created_at,updated_at FROM conversations WHERE id=? AND user_id=?")
    .get(Number(req.params.id), req.user.id);
  if (!conversation) return res.status(404).json({ error: "conversation not found" });
  const turns = db
    .prepare(
      `SELECT id,question,answer,sources_json,created_at FROM turns
       WHERE conversation_id=? ORDER BY id`,
    )
    .all(Number(req.params.id)) as Array<{
    id: number;
    question: string;
    answer: string;
    sources_json: string;
    created_at: string;
  }>;
  const parsedTurns = turns.map((turn) => {
    const item = turn;
    return { ...turn, sources: JSON.parse(item.sources_json) };
  });
  res.json({ conversation, turns: parsedTurns });
});

router.delete("/:id", (req, res) => {
  if (!req.user) return res.status(401).json({ error: "login required" });
  const result = db
    .prepare("DELETE FROM conversations WHERE id=? AND user_id=?")
    .run(Number(req.params.id), req.user.id);
  if (!result.changes) return res.status(404).json({ error: "conversation not found" });
  res.json({ ok: true });
});

export default router;
