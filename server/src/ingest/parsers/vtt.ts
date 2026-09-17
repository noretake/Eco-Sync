import type { NormalizedMessage } from "../normalize.js";

export function deriveTranscriptDate(text: string, sourceName?: string): Date | undefined {
  const filenameDate = sourceName?.match(/(20\d{2}-\d{2}-\d{2})/)?.[1];
  const headerDate = text.match(/(?:date|meeting date)\s*[:=]\s*(20\d{2}-\d{2}-\d{2})/i)?.[1];
  const date = headerDate ?? filenameDate;
  return date ? new Date(`${date}T00:00:00.000Z`) : undefined;
}

export function parseTranscript(
  text: string,
  channel: "teams" | "upload" = "teams",
  sourceName?: string,
): NormalizedMessage[] {
  const lines = text.replace(/\r/g, "").split("\n");
  const output: NormalizedMessage[] = [];
  const baseDate = deriveTranscriptDate(text, sourceName);
  let time = "";
  let speaker = "Transcript";
  let body: string[] = [];

  const flush = () => {
    const content = body.join(" ").trim();
    if (content) {
      const sentAt =
        baseDate && time
          ? new Date(`${baseDate.toISOString().slice(0, 10)}T${time.replace(",", ".")}Z`)
          : (baseDate ?? new Date());
      output.push({ channel, sender: speaker, sentAt, text: content });
    }
    body = [];
  };

  for (const line of lines) {
    const timestamp = line.match(/(\d{2}:\d{2}:\d{2}(?:[.,]\d{3})?)/);
    if (timestamp) {
      flush();
      time = timestamp[1];
      continue;
    }
    if (!line.trim() || /^WEBVTT|^NOTE\b|^\d+$/.test(line.trim())) continue;
    const speakerMatch = line.match(/^([^:]{1,50}):\s*(.*)$/);
    if (speakerMatch) {
      speaker = speakerMatch[1].trim();
      body.push(speakerMatch[2]);
    } else {
      body.push(line.trim());
    }
  }
  flush();
  return output;
}
