import { Router } from "express";
import { z } from "zod";
import { createApiKey, deleteApiKey, listApiKeys, requireUser } from "../auth.js";

const router = Router();
const createSchema = z.object({ label: z.string().trim().min(1).max(100) });

router.use(requireUser);

router.get("/", (req, res) => {
  if (!req.user) return res.status(401).json({ error: "login required" });
  res.json(listApiKeys(req.user.id));
});

router.post("/", (req, res) => {
  if (!req.user) return res.status(401).json({ error: "login required" });
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "label required" });
  res.status(201).json(createApiKey(req.user.id, parsed.data.label));
});

router.delete("/:id", (req, res) => {
  if (!req.user) return res.status(401).json({ error: "login required" });
  const deleted = deleteApiKey(req.user.id, Number(req.params.id));
  if (!deleted) return res.status(404).json({ error: "API key not found" });
  res.json({ ok: true });
});

export default router;
