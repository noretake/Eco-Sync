import { db, source } from "../db/index.js";
import { embed } from "../llm/provider.js";
import { noteLlmError } from "../llm/status.js";
import { chunkMessages, chunkTranscript } from "./chunk.js";
import { normalize, type NormalizedMessage } from "./normalize.js";

async function safeEmbed(content: string) {
  try {
    return await embed(content);
  } catch (error) {
    noteLlmError(error);
    return undefined;
  }
}

export async function ingestMessages(messages: NormalizedMessage[], name = "API") {
  if (!messages.length) return 0;
  const normalized = messages.map(normalize).filter((message) => {
    if (!message.externalId) return true;
    const row = db.prepare("SELECT 1 FROM messages WHERE external_id=?").get(message.externalId);
    return !row;
  });
  if (!normalized.length) return 0;
  const sid = source(normalized[0].channel, name);
  const insertMessage = db.prepare(
    "INSERT OR IGNORE INTO messages(source_id,channel,sender,sent_at,text,thread_id,raw_json,external_id) VALUES(?,?,?,?,?,?,?,?)",
  );
  const insertChunk = db.prepare(
    "INSERT INTO chunks(message_id,source_id,channel,sender,sent_at,content,embedding) VALUES(?,?,?,?,?,?,?)",
  );

  const inserted: Array<{ message: NormalizedMessage; id: number }> = [];
  for (const message of normalized) {
    const result = insertMessage.run(
      sid,
      message.channel,
      message.sender,
      new Date(message.sentAt).toISOString(),
      message.text,
      message.threadId,
      JSON.stringify(message),
      message.externalId ?? null,
    );
    if (result.changes) {
      inserted.push({ message, id: Number(result.lastInsertRowid) });
    }
  }

  const chunks = inserted.some(({ message }) => message.externalId)
    ? inserted.flatMap(({ message, id }) => {
        const chunk = chunkMessages([message], sid)[0];
        if (chunk) chunk.messageId = id;
        return chunk ? [chunk] : [];
      })
    : chunkMessages(
        inserted.map(({ message }) => message),
        sid,
      ).map((chunk) => {
        const matching = inserted.find(({ message }) => chunk.content.includes(message.text));
        return { ...chunk, messageId: matching?.id };
      });

  for (const chunk of chunks) {
    const embedding = await safeEmbed(chunk.content);
    insertChunk.run(
      chunk.messageId ?? null,
      chunk.sourceId,
      chunk.channel,
      chunk.sender,
      chunk.sentAt,
      chunk.content,
      embedding ? Buffer.from(new Float32Array(embedding).buffer) : null,
    );
  }
  return normalized.length;
}

export async function ingestTranscript(
  messages: NormalizedMessage[],
  name = "Transcript",
  sourceDate?: Date,
) {
  if (!messages.length) return 0;
  const sid = source(messages[0].channel, name);
  const normalized = messages.map(normalize);
  const insertMessage = db.prepare(
    "INSERT INTO messages(source_id,channel,sender,sent_at,text,raw_json) VALUES(?,?,?,?,?,?)",
  );
  const insertChunk = db.prepare(
    "INSERT INTO chunks(message_id,source_id,channel,sender,sent_at,content,embedding) VALUES(?,?,?,?,?,?,?)",
  );

  for (const message of normalized) {
    insertMessage.run(
      sid,
      message.channel,
      message.sender,
      new Date(message.sentAt).toISOString(),
      message.text,
      JSON.stringify(message),
    );
  }
  for (const chunk of chunkTranscript(normalized, sid, sourceDate)) {
    const embedding = await safeEmbed(chunk.content);
    insertChunk.run(
      null,
      sid,
      chunk.channel,
      chunk.sender,
      chunk.sentAt,
      chunk.content,
      embedding ? Buffer.from(new Float32Array(embedding).buffer) : null,
    );
  }
  return normalized.length;
}
