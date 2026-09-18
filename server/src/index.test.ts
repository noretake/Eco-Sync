import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import AdmZip from "adm-zip";
import { describe, expect, it, vi } from "vitest";
import request from "supertest";

process.env.AUTH_REQUIRED = "false";
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "ecosync-test-"));
process.env.SEED_DEMO = "true";

const { app } = await import("./index.js");
const { chunkMessages } = await import("./ingest/chunk.js");
const { parseTranscript } = await import("./ingest/parsers/vtt.js");
const { parseWhatsApp } = await import("./ingest/parsers/whatsappExport.js");
const { answer } = await import("./rag/answer.js");
const { db } = await import("./db/index.js");
const { ingestMessages } = await import("./ingest/pipeline.js");
const {
  extractQuestion,
  handleDirectMessage,
  status: whatsappStatus,
} = await import("./connectors/whatsappWeb.js");

describe("parsers and chunker", () => {
  it("parses WhatsApp formats and strips system lines", () => {
    const messages = parseWhatsApp(
      "12/03/24, 10:15 - Ana: Hello\ncontinued\n[13/03/24, 10:15:32] Bo: <Media omitted>\n[13/03/24, 10:16:00] Bo: Good",
    );
    expect(messages).toHaveLength(2);
    expect(messages[0].text).toContain("continued");
  });

  it("parses vtt speaker cues", () => {
    expect(parseTranscript("WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nMaya: Hi")).toHaveLength(1);
  });

  it("windows messages with human-readable timestamps", () => {
    const messages = chunkMessages(
      Array.from({ length: 20 }, () => ({
        channel: "whatsapp" as const,
        sender: "A",
        sentAt: new Date().toISOString(),
        text: "x".repeat(100),
      })),
      1,
    );
    expect(messages.length).toBeGreaterThan(1);
    expect(messages[0].content).toContain("[");
    expect(messages[0].content).not.toContain("T");
  });

  it("returns a concise extractive meeting answer with no provider", async () => {
    const result = await answer("When is the next meeting?");
    const bullets = result.answer.split("\n").filter((line) => line.startsWith("• "));
    expect(bullets.length).toBeLessThanOrEqual(5);
    expect(bullets.some((line) => line.includes("18:30"))).toBe(true);
    expect(result.answer).toContain("Lexical mode — add LLM_API_KEY for AI-written answers.");
  });

  it("serves chat route", async () => {
    const response = await request(app)
      .post("/api/chat")
      .send({ question: "When is the next meeting?" });
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty("answer");
  });

  it("deduplicates messages by external id", async () => {
    const externalId = `test-${Date.now()}`;
    await ingestMessages(
      [
        {
          channel: "whatsapp",
          sender: "Test",
          sentAt: new Date("2024-03-20T12:00:00Z"),
          text: "Deduplication test",
          externalId,
        },
      ],
      "WhatsApp Web Test",
    );
    await ingestMessages(
      [
        {
          channel: "whatsapp",
          sender: "Test",
          sentAt: new Date("2024-03-20T12:00:00Z"),
          text: "Deduplication test",
          externalId,
        },
      ],
      "WhatsApp Web Test",
    );
    const rows = db
      .prepare("SELECT id FROM messages WHERE external_id=?")
      .all(externalId) as Array<{ id: number }>;
    expect(rows).toHaveLength(1);
    db.prepare("DELETE FROM chunks WHERE message_id=?").run(rows[0].id);
    db.prepare("DELETE FROM messages WHERE id=?").run(rows[0].id);
  });

  it("deduplicates repeated demo WhatsApp imports", async () => {
    const demo = fs.readFileSync(
      path.resolve(process.cwd(), "../demo/whatsapp-group-export.txt"),
      "utf8",
    );
    const messages = parseWhatsApp(demo);
    const name = `Demo dedup ${Date.now()}`;
    db.exec(
      "DELETE FROM chunks WHERE source_id IN (SELECT id FROM sources WHERE kind='whatsapp'); DELETE FROM messages WHERE source_id IN (SELECT id FROM sources WHERE kind='whatsapp'); DELETE FROM sources WHERE kind='whatsapp';",
    );
    const first = await ingestMessages(messages, name);
    const second = await ingestMessages(messages, name);
    expect(first).toBe(messages.length);
    expect(second).toBe(0);
    const source = db
      .prepare("SELECT id FROM sources WHERE kind=? AND name=?")
      .get("whatsapp", name) as { id: number };
    db.prepare("DELETE FROM chunks WHERE source_id=?").run(source.id);
    db.prepare("DELETE FROM messages WHERE source_id=?").run(source.id);
    db.prepare("DELETE FROM sources WHERE id=?").run(source.id);
  });

  it("imports a WhatsApp txt from a zip upload", async () => {
    const zip = new AdmZip();
    zip.addFile("WhatsApp Chat.txt", Buffer.from("20/03/24, 18:30 - Maya: Zip upload import test"));
    const response = await request(app)
      .post("/api/ingest/upload")
      .attach("file", zip.toBuffer(), "whatsapp-export.zip");
    expect(response.status).toBe(200);
    expect(response.body.count).toBeGreaterThan(0);
  });

  it("extracts @eco and /ask questions", () => {
    expect(extractQuestion("@eco When is the meeting?")).toBe("When is the meeting?");
    expect(extractQuestion("/ask  where is the venue?")).toBe("where is the venue?");
    expect(extractQuestion("hello group")).toBeNull();
  });

  it("rejects direct messages from non-members", async () => {
    const replies: string[] = [];
    whatsappStatus.targetGroup = "Demo group";
    const message = {
      from: "non-member@c.us",
      fromMe: false,
      type: "chat",
      body: "When is the next meeting?",
      reply: async (text: string) => {
        replies.push(text);
      },
    } as never;
    const targetGroup = {
      participants: [{ id: { _serialized: "member@c.us" } }],
    } as never;
    await handleDirectMessage(message, {} as never, targetGroup);
    expect(replies).toEqual(["Sorry, Eco Sync only answers members of the group."]);
    whatsappStatus.targetGroup = undefined;
  });

  it("answers direct messages from group members", async () => {
    const replies: string[] = [];
    whatsappStatus.targetGroup = "Demo group";
    const message = {
      from: "member@c.us",
      fromMe: false,
      type: "chat",
      body: "When is the next meeting?",
      reply: async (text: string) => {
        replies.push(text);
      },
    } as never;
    const targetGroup = {
      participants: [{ id: { _serialized: "member@c.us" } }],
    } as never;
    await handleDirectMessage(message, {} as never, targetGroup);
    expect(replies[0]).toBeTruthy();
    whatsappStatus.targetGroup = undefined;
  });

  it("falls back to lexical bullets when the LLM fails", async () => {
    vi.doMock("./llm/provider.js", () => ({
      provider: "openai-compatible",
      embed: vi.fn().mockResolvedValue(undefined),
      complete: vi.fn().mockRejectedValue(new Error("LLM 429 insufficient_quota")),
    }));
    vi.resetModules();
    const { answer: answerWithFailure } = await import("./rag/answer.js");

    const result = await answerWithFailure("When is the next meeting?");
    const bullets = result.answer.split("\n").filter((line) => line.startsWith("• "));
    expect(bullets.length).toBeGreaterThan(0);
    expect(result.answer).toContain("AI answers unavailable (HTTP 429)");

    vi.doUnmock("./llm/provider.js");
    vi.resetModules();
  });
});
