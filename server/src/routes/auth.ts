import { Router } from "express";
import { randomBytes } from "node:crypto";
import type { Request } from "express";
import { z } from "zod";
import {
  clearSessionCookie,
  createSession,
  getUser,
  hashPassword,
  setSessionCookie,
  verifyPassword,
} from "../auth.js";
import { config, googleEnabled } from "../config.js";
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

const oauthCookie = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  maxAge: 10 * 60 * 1000,
  path: "/",
};

function baseUrl(req: Request) {
  return (config.PUBLIC_URL || `${req.protocol}://${req.get("host")}`).replace(/\/+$/, "");
}

function googleRedirectUri(req: Request) {
  return `${baseUrl(req)}/api/auth/google/callback`;
}

function authErrorRedirect(error: string) {
  return `/?auth_error=${error}`;
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

router.get("/google/start", (req, res) => {
  if (!googleEnabled) return res.status(404).json({ error: "google login not configured" });
  const state = randomBytes(16).toString("hex");
  const accessCode = typeof req.query.accessCode === "string" ? req.query.accessCode : "";
  res.cookie("eco_oauth", JSON.stringify({ state, accessCode }), oauthCookie);
  const params = new URLSearchParams({
    client_id: config.GOOGLE_CLIENT_ID!,
    redirect_uri: googleRedirectUri(req),
    response_type: "code",
    scope: "openid email profile",
    state,
    prompt: "select_account",
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

router.get("/google/callback", async (req, res) => {
  const rawCookie = req.cookies?.eco_oauth as string | undefined;
  res.clearCookie("eco_oauth", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
  let oauth: { state: string; accessCode?: string } | undefined;
  try {
    oauth = rawCookie ? JSON.parse(rawCookie) : undefined;
  } catch {
    oauth = undefined;
  }
  const state = typeof req.query.state === "string" ? req.query.state : "";
  if (!oauth?.state || !state || oauth.state !== state) {
    return res.redirect(authErrorRedirect("state"));
  }
  if (!googleEnabled || typeof req.query.code !== "string") {
    return res.redirect(authErrorRedirect("google"));
  }
  try {
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code: req.query.code,
        client_id: config.GOOGLE_CLIENT_ID!,
        client_secret: config.GOOGLE_CLIENT_SECRET!,
        redirect_uri: googleRedirectUri(req),
        grant_type: "authorization_code",
      }),
    });
    if (!tokenResponse.ok) throw new Error("token exchange failed");
    const token = (await tokenResponse.json()) as { access_token?: string };
    if (!token.access_token) throw new Error("missing access token");
    const userinfoResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { Authorization: `Bearer ${token.access_token}` },
    });
    if (!userinfoResponse.ok) throw new Error("userinfo request failed");
    const userinfo = (await userinfoResponse.json()) as {
      sub?: string;
      email?: string;
      email_verified?: boolean;
      name?: string;
    };
    if (!userinfo.email_verified) return res.redirect(authErrorRedirect("unverified"));
    if (!userinfo.sub || !userinfo.email) throw new Error("incomplete user info");
    const email = userinfo.email.toLowerCase();
    let user = db
      .prepare("SELECT id,name,email,google_sub FROM users WHERE google_sub=?")
      .get(userinfo.sub) as
      | { id: number; name: string; email: string; google_sub: string | null }
      | undefined;
    if (!user) {
      user = db.prepare("SELECT id,name,email,google_sub FROM users WHERE email=?").get(email) as
        | { id: number; name: string; email: string; google_sub: string | null }
        | undefined;
    }
    if (user) {
      if (!user.google_sub) {
        db.prepare("UPDATE users SET google_sub=? WHERE id=?").run(userinfo.sub, user.id);
      }
    } else {
      if (config.GROUP_ACCESS_CODE && oauth.accessCode !== config.GROUP_ACCESS_CODE) {
        return res.redirect(authErrorRedirect("access_code"));
      }
      const name = userinfo.name?.trim() || email.split("@")[0];
      user = db
        .prepare(
          "INSERT INTO users(email,name,password_hash,google_sub,created_at) VALUES(?,?,?,?,?) RETURNING id,name,email,google_sub",
        )
        .get(email, name, "google", userinfo.sub, new Date().toISOString()) as {
        id: number;
        name: string;
        email: string;
        google_sub: string;
      };
    }
    const session = createSession(user.id);
    setSessionCookie(res, session);
    return res.redirect("/");
  } catch {
    return res.redirect(authErrorRedirect("google"));
  }
});

router.get("/me", (req, res) => {
  res.json({
    user: getUser(req) ?? null,
    authRequired: config.AUTH_REQUIRED,
    accessCodeRequired: !!config.GROUP_ACCESS_CODE,
    googleEnabled,
  });
});

export default router;
