import type { Express } from "express";
import { config } from "../config.js";
import { ingestMessages } from "../ingest/pipeline.js";
import { answer } from "../rag/answer.js";
export function startWhatsApp(app: Express) {
  app.get("/webhooks/whatsapp", (req, res) => {
    if (req.query["hub.verify_token"] === config.WHATSAPP_VERIFY_TOKEN)
      return res.send(req.query["hub.challenge"]);
    res.sendStatus(403);
  });
  app.post("/webhooks/whatsapp", async (req, res) => {
    res.sendStatus(200);
    const value = req.body.entry?.[0]?.changes?.[0]?.value;
    const msg = value?.messages?.[0];
    if (!msg?.text?.body) return;
    const text = msg.text.body;
    await ingestMessages(
      [
        {
          channel: "whatsapp",
          sender: value.contacts?.[0]?.profile?.name ?? msg.from,
          sentAt: new Date(Number(msg.timestamp) * 1000),
          text,
        },
      ],
      "WhatsApp Cloud",
    );
    if (
      (text.startsWith("@eco") || text.startsWith("/ask") || config.WHATSAPP_REPLY_ALL) &&
      config.WHATSAPP_TOKEN &&
      config.WHATSAPP_PHONE_NUMBER_ID
    ) {
      const result = await answer(text.replace(/^(@eco|\/ask)\s*/, ""));
      await fetch(`https://graph.facebook.com/v20.0/${config.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${config.WHATSAPP_TOKEN}`,
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: msg.from,
          type: "text",
          text: { body: result.answer },
        }),
      });
    }
  });
}
