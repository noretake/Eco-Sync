import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseWhatsApp } from "./ingest/parsers/whatsappExport.js";
import { deriveTranscriptDate, parseTranscript } from "./ingest/parsers/vtt.js";
import { ingestMessages, ingestTranscript } from "./ingest/pipeline.js";
import { db } from "./db/index.js";
function demoRoot() {
  const current = path.resolve(process.cwd(), "demo");
  return fs.existsSync(current) ? current : path.resolve(process.cwd(), "../demo");
}

export async function seedDemo() {
  const root = demoRoot();
  db.exec("DELETE FROM chunks; DELETE FROM messages; DELETE FROM sources;");
  const wa = fs.readFileSync(path.join(root, "whatsapp-group-export.txt"), "utf8");
  await ingestMessages(parseWhatsApp(wa), "GreenHub Community WhatsApp");
  const transcriptName = "teams-meeting-2024-06-12.vtt";
  const vtt = fs.readFileSync(path.join(root, transcriptName), "utf8");
  const transcriptDate = deriveTranscriptDate(vtt, transcriptName);
  await ingestTranscript(
    parseTranscript(vtt, "teams", transcriptName),
    "GreenHub Teams Meeting",
    transcriptDate,
  );
  const emails = JSON.parse(fs.readFileSync(path.join(root, "emails.json"), "utf8"));
  await ingestMessages(emails, "GreenHub Email");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  seedDemo()
    .then(() => console.log("Seeded demo data"))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
