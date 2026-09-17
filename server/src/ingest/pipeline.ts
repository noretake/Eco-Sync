import { db, source } from "../db/index.js";
import { embed } from "../llm/provider.js";
import { chunkMessages, chunkTranscript } from "./chunk.js";
import { normalize, type NormalizedMessage } from "./normalize.js";

export async function ingestMessages(messages: NormalizedMessage[], name = "API") {
  if (!messages.length) return 0;
  const normalized = messages.map(normalize);
  const sid = source(normalized[0].channel, name);
  const insertMessage = db.prepare(
    "INSERT INTO messages(source_id,channel,sender,sent_at,text,thread_id,raw_json) VALUES(?,?,?,?,?,?,?)",
  );
  const chunks = chunkMessages(normalized, sid);
  const insertChunk = db.prepare(
    "INSERT INTO chunks(message_id,source_id,channel,sender,sent_at,content,embedding) VALUES(?,?,?,?,?,?,?)",
  );

  for (const message of normalized) {
    const id = Number(
      insertMessage.run(
        sid,
        message.channel,
        message.sender,
        new Date(message.sentAt).toISOString(),
        message.text,
        message.threadId,
        JSON.stringify(message),
      ).lastInsertRowid,
    );
    const chunk = chunks.find((candidate) => candidate.content.includes(message.text));
    if (chunk) chunk.messageId = id;
  }

  for (const chunk of chunks) {
    const embedding = await embed(chunk.content);
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
    const embedding = await embed(chunk.content);
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
