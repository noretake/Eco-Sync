import { promisify } from "node:util";
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
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
  if (!token) return undefined;
  const row = db
    .prepare(
      `SELECT users.id,users.name,users.email,sessions.expires_at
       FROM sessions JOIN users ON users.id=sessions.user_id
       WHERE sessions.token=?`,
    )
    .get(token) as (User & { expires_at: string }) | undefined;
  if (!row) return undefined;
  if (new Date(row.expires_at).getTime() <= Date.now()) {
    db.prepare("DELETE FROM sessions WHERE token=?").run(token);
    return undefined;
  }
  return { id: row.id, name: row.name, email: row.email };
}

export function requireUser(req: Request, res: Response, next: NextFunction) {
  req.user = getUser(req);
  if (config.AUTH_REQUIRED && !req.user) return res.status(401).json({ error: "login required" });
  next();
}
