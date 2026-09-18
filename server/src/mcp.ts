import type { Request, Response } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import type { User } from "./auth.js";
import { saveTurn } from "./routes/chat.js";
import { answer, catchUp } from "./rag/answer.js";
import { retrieve } from "./rag/retrieve.js";

const channelSchema = z.enum(["whatsapp", "email", "teams"]).optional();

function sourceText(
  sources: Array<{ sender: string; date: string; channel: string; content?: string }>,
) {
  if (!sources.length) return "";
  return `\n\nSources:\n${sources
    .map(
      (source) =>
        `- ${source.sender} — sent_at: ${source.date} — ${source.channel}: ${(source.content ?? "").slice(0, 140)}`,
    )
    .join("\n")}`;
}

function createServer(user: User) {
  const server = new McpServer({ name: "eco-sync", version: "1.0.0" });
  type ToolResponse = { content: Array<{ type: "text"; text: string }> };
  const registerTool = server.tool.bind(server) as unknown as (
    name: string,
    description: string,
    schema: Record<string, z.ZodTypeAny>,
    handler: (args: Record<string, unknown>) => Promise<ToolResponse>,
  ) => unknown;
  registerTool(
    "ask_group",
    "Ask Eco Sync a question about the group's remembered conversations.",
    {
      question: z.string().min(1).describe("The question to answer."),
      channel: channelSchema.describe("Optionally limit the answer to one channel."),
    },
    async (args) => {
      const { question, channel } = args as { question: string; channel?: string };
      const result = await answer(question, channel);
      saveTurn(user.id, undefined, question, result);
      return { content: [{ type: "text", text: result.answer + sourceText(result.sources) }] };
    },
  );
  registerTool(
    "catch_up",
    "Summarize recent group conversations.",
    {
      days: z.number().int().min(1).max(90).default(7).describe("How many days to summarize."),
      channel: channelSchema.describe("Optionally limit the summary to one channel."),
    },
    async (args) => {
      const { days, channel } = args as { days: number; channel?: string };
      const result = await catchUp(new Date(Date.now() - days * 864e5), channel);
      const title = `Catch-up: last ${days} days`;
      saveTurn(user.id, undefined, title, result, title);
      return { content: [{ type: "text", text: result.answer + sourceText(result.sources) }] };
    },
  );
  registerTool(
    "search_messages",
    "Search the group's messages and return matching snippets.",
    {
      query: z.string().min(1).describe("Words to search for."),
      limit: z.number().int().min(1).max(25).default(10).describe("Maximum results."),
      channel: channelSchema.describe("Optionally limit results to one channel."),
    },
    async (args) => {
      const { query, limit, channel } = args as {
        query: string;
        limit?: number;
        channel?: string;
      };
      const rows = await retrieve(query, limit, channel);
      const text =
        rows
          .map((row) => `[${row.channel}] ${row.sender} — ${row.sent_at}: ${row.content}`)
          .join("\n") || "No messages found.";
      return { content: [{ type: "text", text }] };
    },
  );
  return server;
}

export async function mcpHandler(req: Request, res: Response) {
  if (!req.user) {
    res.status(401).json({ error: "Authorization: Bearer <api key> required" });
    return;
  }
  const server = createServer(req.user);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  const close = () => {
    void Promise.allSettled([server.close(), transport.close()]);
  };
  res.on("close", close);
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    close();
    if (!res.headersSent) res.status(500).json({ error: String(error) });
  }
}
