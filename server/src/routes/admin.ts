import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import { config } from "../config.js";

export function isAdminRequest(req: Request) {
  return !config.ADMIN_TOKEN || req.header("x-admin-token") === config.ADMIN_TOKEN;
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!isAdminRequest(req)) return res.status(401).json({ error: "unauthorized" });
  next();
}

const router = Router();

router.get("/required", (_req, res) => res.json({ required: !!config.ADMIN_TOKEN }));
router.get("/check", requireAdmin, (_req, res) => res.json({ ok: true }));

export default router;
