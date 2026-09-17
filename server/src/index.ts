import express from "express";
import cors from "cors";
import path from "node:path";
import { config } from "./config.js";
import { db } from "./db/index.js";
import chatRouter from "./routes/chat.js";
import ingestRouter from "./routes/ingest.js";
import { startWhatsApp } from "./connectors/whatsapp.js";
import { startEmail } from "./connectors/email.js";
import { startTeams } from "./connectors/teams.js";

export const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use("/api", chatRouter);
app.use("/api/ingest", ingestRouter);
app.get("/health", (_req, res) => res.json({ ok: true }));
const webDist = path.resolve(process.cwd(), "web/dist");
app.use(express.static(webDist));
app.get("*", (_req, res, next) => {
  if (_req.path.startsWith("/api") || _req.path.startsWith("/webhooks")) return next();
  res.sendFile(path.join(webDist, "index.html"), (err) => err && next());
});
startWhatsApp(app);
startEmail();
startTeams(app);
if (process.env.NODE_ENV !== "test")
  app.listen(config.PORT, () => console.log(`Eco Sync listening on ${config.PORT}`));
export { db };
