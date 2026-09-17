import { describe, expect, it, vi } from "vitest";
import request from "supertest";
import { app } from "./index.js";
import { chunkMessages } from "./ingest/chunk.js";
import { parseTranscript } from "./ingest/parsers/vtt.js";
import { parseWhatsApp } from "./ingest/parsers/whatsappExport.js";
import { answer } from "./rag/answer.js";
import { db } from "./db/index.js";
import { ingestMessages } from "./ingest/pipeline.js";
import { extractQuestion } from "./connectors/whatsappWeb.js";

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

  it("extracts @eco and /ask questions", () => {
    expect(extractQuestion("@eco When is the meeting?")).toBe("When is the meeting?");
    expect(extractQuestion("/ask  where is the venue?")).toBe("where is the venue?");
    expect(extractQuestion("hello group")).toBeNull();
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
