import { describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "./index.js";
import { chunkMessages } from "./ingest/chunk.js";
import { parseTranscript } from "./ingest/parsers/vtt.js";
import { parseWhatsApp } from "./ingest/parsers/whatsappExport.js";
import { answer } from "./rag/answer.js";

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
});
