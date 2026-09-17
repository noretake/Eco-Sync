import { Router } from "express";
import { z } from "zod";
import {
  clearSessionCookie,
  createSession,
  getUser,
  hashPassword,
  setSessionCookie,
  verifyPassword,
} from "../auth.js";
import { config } from "../config.js";
import { db } from "../db/index.js";

const router = Router();
const credentials = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});
const signupSchema = credentials.extend({
  name: z.string().trim().min(1),
  accessCode: z.string().optional().default(""),
});

function publicUser(user: { id: number; name: string; email: string }) {
  return { id: user.id, name: user.name, email: user.email };
}

router.post("/signup", async (req, res) => {
  const parsed = signupSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message });
  if (config.GROUP_ACCESS_CODE && parsed.data.accessCode !== config.GROUP_ACCESS_CODE) {
    return res.status(403).json({ error: "invalid access code" });
  }
  const email = parsed.data.email.toLowerCase();
  const existing = db.prepare("SELECT id FROM users WHERE email=?").get(email);
  if (existing) return res.status(409).json({ error: "email already registered" });
  const user = db
    .prepare(
      "INSERT INTO users(email,name,password_hash,created_at) VALUES(?,?,?,?) RETURNING id,name,email",
    )
    .get(
      email,
      parsed.data.name,
      await hashPassword(parsed.data.password),
      new Date().toISOString(),
    ) as { id: number; name: string; email: string };
  const token = createSession(user.id);
  setSessionCookie(res, token);
  res.json({ user: publicUser(user) });
});

router.post("/login", async (req, res) => {
  const parsed = credentials.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid email or password" });
  const email = parsed.data.email.toLowerCase();
  const row = db
    .prepare("SELECT id,name,email,password_hash FROM users WHERE email=?")
    .get(email) as { id: number; name: string; email: string; password_hash: string } | undefined;
  if (!row || !(await verifyPassword(parsed.data.password, row.password_hash))) {
    return res.status(401).json({ error: "invalid email or password" });
  }
  const token = createSession(row.id);
  setSessionCookie(res, token);
  res.json({ user: publicUser(row) });
});

router.post("/logout", (req, res) => {
  const token = req.cookies?.eco_session as string | undefined;
  if (token) db.prepare("DELETE FROM sessions WHERE token=?").run(token);
  clearSessionCookie(res);
  res.json({ ok: true });
});

router.get("/me", (req, res) => {
  res.json({
    user: getUser(req) ?? null,
    authRequired: config.AUTH_REQUIRED,
    accessCodeRequired: !!config.GROUP_ACCESS_CODE,
  });
});

export default router;
