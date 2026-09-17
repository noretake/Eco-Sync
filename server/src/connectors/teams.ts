import type { Express } from "express";
import { config } from "../config.js";
import { ingestMessages } from "../ingest/pipeline.js";
import { answer } from "../rag/answer.js";
export function startTeams(app: Express) {
  app.post("/webhooks/teams", async (req, res) => {
    const text = req.body.text ?? "";
    const result = await answer(text);
    res.json({ type: "message", text: result.answer });
    if (text)
      await ingestMessages(
        [
          {
            channel: "teams",
            sender: req.body.from?.name ?? "Teams user",
            sentAt: new Date(),
            text,
          },
        ],
        "Teams Bot",
      );
  });
  if (!(config.TEAMS_TENANT_ID && config.TEAMS_CLIENT_ID && config.TEAMS_CLIENT_SECRET)) return;
  setInterval(() => void sync(), config.TEAMS_POLL_SECONDS * 1000);
  void sync();
}
async function sync() {
  const token = await fetch(
    `https://login.microsoftonline.com/${config.TEAMS_TENANT_ID}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: config.TEAMS_CLIENT_ID!,
        client_secret: config.TEAMS_CLIENT_SECRET!,
        scope: "https://graph.microsoft.com/.default",
        grant_type: "client_credentials",
      }),
    },
  ).then((r) => r.json() as Promise<{ access_token: string }>);
  if (!token.access_token) return;
  const r = await fetch(
    `https://graph.microsoft.com/v1.0/teams/${config.TEAMS_TEAM_ID}/channels/${config.TEAMS_CHANNEL_ID}/messages`,
    { headers: { authorization: `Bearer ${token.access_token}` } },
  );
  if (!r.ok) return;
  const j = (await r.json()) as { value?: any[] };
  if (j.value)
    await ingestMessages(
      j.value.map((m) => ({
        channel: "teams" as const,
        sender: m.from?.user?.displayName ?? "Teams",
        sentAt: m.createdDateTime,
        text: m.body?.content?.replace(/<[^>]+>/g, "") ?? "",
      })),
      "Microsoft Teams",
    );
}
