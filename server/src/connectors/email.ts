import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import nodemailer from "nodemailer";
import { config } from "../config.js";
import { ingestMessages } from "../ingest/pipeline.js";
import { answer } from "../rag/answer.js";
export function startEmail() {
  if (!config.EMAIL_IMAP_HOST) return;
  void (async () => {
    const client = new ImapFlow({
      host: config.EMAIL_IMAP_HOST!,
      port: config.EMAIL_IMAP_PORT,
      secure: true,
      auth: { user: config.EMAIL_IMAP_USER!, pass: config.EMAIL_IMAP_PASS! },
    });
    await client.connect();
    const poll = async () => {
      const lock = await client.getMailboxLock("INBOX");
      try {
        for await (const m of client.fetch({ seen: false }, { envelope: true, source: true })) {
          const mail = await simpleParser(m.source);
          const text = mail.text ?? "";
          await ingestMessages(
            [
              {
                channel: "email",
                sender: mail.from?.text ?? "unknown",
                sentAt: mail.date ?? new Date(),
                text,
                threadId: mail.messageId,
              },
            ],
            "Email",
          );
          if (
            mail.subject?.startsWith("Eco Sync:") ||
            mail.to?.text.includes(config.EMAIL_BOT_ADDRESS ?? "never")
          ) {
            const result = await answer(text);
            const transport = nodemailer.createTransport({
              host: config.EMAIL_SMTP_HOST,
              port: config.EMAIL_SMTP_PORT,
            });
            await transport.sendMail({
              from: config.EMAIL_BOT_ADDRESS,
              to: mail.from?.text,
              subject: "Re: " + mail.subject,
              text: result.answer,
            });
          }
        }
      } finally {
        lock.release();
      }
    };
    await poll();
    setInterval(poll, config.EMAIL_POLL_SECONDS * 1000);
  })().catch((e) => console.error("Email connector", e));
}
