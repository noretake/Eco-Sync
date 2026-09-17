import { Router } from "express";
import { logoutWhatsAppWeb, setTargetGroup, status } from "../connectors/whatsappWeb.js";

const router = Router();

router.get("/whatsapp/status", (_req, res) => {
  res.json(status);
});

router.post("/whatsapp/group", async (req, res) => {
  const group = typeof req.body?.group === "string" ? req.body.group.trim() : "";
  if (!group) return res.status(400).json({ error: "group required" });
  await setTargetGroup(group);
  res.json(status);
});

router.post("/whatsapp/logout", async (_req, res) => {
  await logoutWhatsAppWeb();
  res.json(status);
});

export default router;
