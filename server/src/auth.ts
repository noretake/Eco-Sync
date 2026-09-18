import { promisify } from "node:util";
import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { config } from "./config.js";
import { db } from "./db/index.js";

const scrypt = promisify(scryptCallback);
const SESSION_COOKIE = "eco_session";
const SESSION_DAYS = 30;

export type User = {
  id: number;
  name: string;
  email: string;
};

declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt$${salt}$${hash.toString("hex")}`;
}

export async function verifyPassword(password: string, encoded: string) {
  const [, salt, expectedHex] = encoded.split("$");
  if (!salt || !expectedHex) return false;
  const expected = Buffer.from(expectedHex, "hex");
  const actual = (await scrypt(password, salt, expected.length)) as Buffer;
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function createApiKey(userId: number, label: string) {
  const token = `eco_${randomBytes(20).toString("hex")}`;
  const prefix = token.slice(0, 12);
  const createdAt = new Date().toISOString();
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const row = db
    .prepare(
      "INSERT INTO api_keys(user_id,token_hash,prefix,label,created_at) VALUES(?,?,?,?,?) RETURNING id",
    )
    .get(userId, tokenHash, prefix, label, createdAt) as { id: number };
  return { id: row.id, token, prefix, label, createdAt };
}

export function listApiKeys(userId: number) {
  return db
    .prepare(
      "SELECT id,prefix,label,created_at,last_used_at FROM api_keys WHERE user_id=? ORDER BY id DESC",
    )
    .all(userId) as Array<{
    id: number;
    prefix: string;
    label: string;
    created_at: string;
    last_used_at: string | null;
  }>;
}

export function deleteApiKey(userId: number, id: number) {
  return db.prepare("DELETE FROM api_keys WHERE id=? AND user_id=?").run(id, userId).changes > 0;
}

export function getUserByApiKey(token: string): User | undefined {
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const row = db
    .prepare(
      `SELECT users.id,users.name,users.email
       FROM api_keys JOIN users ON users.id=api_keys.user_id
       WHERE api_keys.token_hash=?`,
    )
    .get(tokenHash) as User | undefined;
  if (!row) return undefined;
  db.prepare("UPDATE api_keys SET last_used_at=? WHERE token_hash=?").run(
    new Date().toISOString(),
    tokenHash,
  );
  return row;
}

export function createSession(userId: number) {
  const token = randomBytes(32).toString("hex");
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + SESSION_DAYS * 864e5);
  db.prepare("INSERT INTO sessions(token,user_id,created_at,expires_at) VALUES(?,?,?,?)").run(
    token,
    userId,
    createdAt.toISOString(),
    expiresAt.toISOString(),
  );
  return token;
}

function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
  };
}

export function setSessionCookie(res: Response, token: string) {
  res.cookie(SESSION_COOKIE, token, sessionCookieOptions());
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(SESSION_COOKIE, sessionCookieOptions());
}

export function getUser(req: Request): User | undefined {
  const token = req.cookies?.[SESSION_COOKIE] as string | undefined;
  if (token) {
    const row = db
      .prepare(
        `SELECT users.id,users.name,users.email,sessions.expires_at
         FROM sessions JOIN users ON users.id=sessions.user_id
         WHERE sessions.token=?`,
      )
      .get(token) as (User & { expires_at: string }) | undefined;
    if (row) {
      if (new Date(row.expires_at).getTime() <= Date.now()) {
        db.prepare("DELETE FROM sessions WHERE token=?").run(token);
      } else {
        return { id: row.id, name: row.name, email: row.email };
      }
    }
    return undefined;
  }
  const authorization = req.get("authorization");
  const bearer = authorization?.match(/^Bearer\s+(eco_[0-9a-f]+)$/i)?.[1];
  return bearer ? getUserByApiKey(bearer) : undefined;
}

export function requireUser(req: Request, res: Response, next: NextFunction) {
  req.user = getUser(req);
  if (config.AUTH_REQUIRED && !req.user && req.path !== "/mcp") {
    return res.status(401).json({ error: "login required" });
  }
  next();
}
