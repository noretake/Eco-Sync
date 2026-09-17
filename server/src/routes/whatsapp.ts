import { Router } from "express";
import { logoutWhatsAppWeb, setTargetGroup, status } from "../connectors/whatsappWeb.js";
import { isAdminRequest, requireAdmin } from "./admin.js";

const router = Router();

router.get("/whatsapp/status", (req, res) => {
  if (isAdminRequest(req)) return res.json(status);
  const { state, targetGroup, me } = status;
  res.json({ state, targetGroup, ...(me ? { me } : {}) });
});

router.post("/whatsapp/group", requireAdmin, async (req, res) => {
  const group = typeof req.body?.group === "string" ? req.body.group.trim() : "";
  if (!group) return res.status(400).json({ error: "group required" });
  await setTargetGroup(group);
  res.json(status);
});

router.post("/whatsapp/logout", requireAdmin, async (_req, res) => {
  await logoutWhatsAppWeb();
  res.json(status);
});

export default router;
