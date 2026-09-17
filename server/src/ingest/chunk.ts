import type { NormalizedMessage } from "./normalize.js";

export type Chunk = {
  messageId?: number;
  sourceId: number;
  channel: string;
  sender: string;
  sentAt: string;
  content: string;
};

const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatHumanTimestamp(value: Date | string, includeTime = true) {
  const date = new Date(value);
  const day = String(date.getUTCDate()).padStart(2, "0");
  const month = months[date.getUTCMonth()];
  const year = date.getUTCFullYear();
  if (!includeTime) return `${day} ${month} ${year}`;
  const hour = String(date.getUTCHours()).padStart(2, "0");
  const minute = String(date.getUTCMinutes()).padStart(2, "0");
  return `${day} ${month} ${year} ${hour}:${minute}`;
}

export function chunkMessages(messages: NormalizedMessage[], sourceId: number): Chunk[] {
  const out: Chunk[] = [];
  let buffer: string[] = [];
  let first: NormalizedMessage | undefined;
  let size = 0;

  const flush = () => {
    if (!first || !buffer.length) return;
    out.push({
      sourceId,
      channel: first.channel,
      sender: first.sender,
      sentAt: new Date(first.sentAt).toISOString(),
      content: `Channel: ${first.channel}\nParticipants: ${[
        ...new Set(
          messages
            .filter((message) => message.channel === first?.channel)
            .map((message) => message.sender),
        ),
      ].join(", ")}\n\n${buffer.join("\n")}`,
    });
    buffer = [];
    size = 0;
    first = undefined;
  };

  for (const message of messages) {
    const line = `[${formatHumanTimestamp(message.sentAt)}] ${message.sender}: ${message.text}`;
    if (first && (message.channel !== first.channel || size + line.length > 1500)) flush();
    if (!first) first = message;
    buffer.push(line);
    size += line.length;
  }
  flush();
  return out;
}

export function chunkTranscript(
  messages: NormalizedMessage[],
  sourceId: number,
  sourceDate?: Date,
): Chunk[] {
  const text = messages.map((message) => `[${message.sender}] ${message.text}`).join("\n");
  const out: Chunk[] = [];
  const sentAt = (sourceDate ?? new Date(messages[0]?.sentAt ?? Date.now())).toISOString();
  for (let index = 0; index < text.length; index += 1300) {
    out.push({
      sourceId,
      channel: messages[0]?.channel ?? "teams",
      sender: "Transcript",
      sentAt,
      content: `Transcript\n\n${text.slice(index, index + 1500)}`,
    });
  }
  return out;
}
