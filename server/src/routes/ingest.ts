import { Router } from "express";
import AdmZip from "adm-zip";
import multer from "multer";
import { ingestMessages, ingestTranscript } from "../ingest/pipeline.js";
import { parseWhatsApp } from "../ingest/parsers/whatsappExport.js";
import { deriveTranscriptDate, parseTranscript } from "../ingest/parsers/vtt.js";
import { transcribe } from "../llm/transcribe.js";
import { simpleParser } from "mailparser";
import { requireAdmin } from "./admin.js";

const upload = multer({ storage: multer.memoryStorage() });
const router = Router();
router.use(requireAdmin);

router.post("/messages", async (req, res) => {
  try {
    res.json({ count: await ingestMessages(req.body.messages ?? req.body) });
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});
router.post("/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "file required" });
    const name = req.file.originalname;
    let ext = name.toLowerCase().split(".").pop();
    let text = req.file.buffer.toString();
    if (ext === "zip") {
      const zip = new AdmZip(req.file.buffer);
      const entry = zip
        .getEntries()
        .find((candidate) => !candidate.isDirectory && /\.txt$/i.test(candidate.entryName));
      if (!entry) return res.status(415).json({ error: "no chat .txt found in zip" });
      ext = "txt";
      text = entry.getData().toString("utf8");
    }
    if (ext === "txt" && /^\s*\[?\d{1,2}\/\d{1,2}\/\d{2}/m.test(text))
      return res.json({ count: await ingestMessages(parseWhatsApp(text), name) });
    if (ext === "txt" || ext === "vtt") {
      const date = deriveTranscriptDate(text, name);
      return res.json(await ingestTranscript(parseTranscript(text, "teams", name), name, date));
    }
    if (ext === "eml") {
      const mail = await simpleParser(req.file.buffer);
      return res.json({
        count: await ingestMessages(
          [
            {
              channel: "email",
              sender: mail.from?.text ?? "Email",
              sentAt: mail.date ?? new Date(),
              text: mail.text ?? "",
            },
          ],
          name,
        ),
      });
    }
    if (["mp3", "m4a", "wav", "mp4", "webm"].includes(ext ?? "")) {
      const transcript = await transcribe(req.file.buffer, name);
      const date = deriveTranscriptDate(transcript, name);
      return res.json({
        ...(transcript
          ? await ingestTranscript(parseTranscript(transcript, "teams", name), name, date)
          : { count: 0 }),
      });
    }
    return res.status(415).json({ error: "unsupported file" });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
});
export default router;
