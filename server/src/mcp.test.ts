import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";

process.env.AUTH_REQUIRED = "true";
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "ecosync-mcp-test-"));
process.env.SEED_DEMO = "true";
process.env.NODE_ENV = "test";

const { app } = await import("./index.js");

const headers = {
  accept: "application/json, text/event-stream",
  "content-type": "application/json",
};
let apiKey = "";
let toolsListRaw = "";
let searchRaw = "";

function rpcBody(raw: string) {
  const data = raw.split("\n").find((line) => line.startsWith("data:"));
  return JSON.parse(data ? data.slice(5).trim() : raw);
}

describe("MCP API", () => {
  it("rejects API key creation without login", async () => {
    const response = await request(app).post("/api/keys").send({ label: "Test agent" });
    expect(response.status).toBe(401);
  });

  it("creates and lists a personal API key", async () => {
    const agent = request.agent(app);
    const signup = await agent.post("/api/auth/signup").send({
      name: "MCP Member",
      email: `mcp-${Date.now()}@example.test`,
      password: "password123",
    });
    expect(signup.status).toBe(200);
    const created = await agent.post("/api/keys").send({ label: "Test agent" });
    expect(created.status).toBe(201);
    expect(created.body.token).toMatch(/^eco_[0-9a-f]{40}$/);
    apiKey = created.body.token;
    const listed = await agent.get("/api/keys");
    expect(listed.status).toBe(200);
    expect(listed.body).toEqual([
      expect.objectContaining({ prefix: created.body.prefix, label: "Test agent" }),
    ]);
  });

  it("lists MCP tools with an API key", async () => {
    const response = await request(app)
      .post("/mcp")
      .set("authorization", `Bearer ${apiKey}`)
      .set(headers)
      .send({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} });
    toolsListRaw = response.text;
    expect(response.status).toBe(200);
    const body = rpcBody(response.text);
    const names = body.result.tools.map((tool: { name: string }) => tool.name);
    expect(names).toEqual(expect.arrayContaining(["ask_group", "catch_up", "search_messages"]));
  });

  it("searches messages through MCP", async () => {
    const response = await request(app)
      .post("/mcp")
      .set("authorization", `Bearer ${apiKey}`)
      .set(headers)
      .send({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: { name: "search_messages", arguments: { query: "meeting" } },
      });
    searchRaw = response.text;
    expect(response.status).toBe(200);
    const body = rpcBody(response.text);
    expect(body.result.content[0].text).toBeTruthy();
  });

  it("rejects MCP requests without a key", async () => {
    const response = await request(app)
      .post("/mcp")
      .set(headers)
      .send({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} });
    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: "Authorization: Bearer <api key> required" });
  });
});

afterAll(() => {
  if (toolsListRaw) console.log(`MCP tools/list raw response: ${toolsListRaw}`);
  if (searchRaw) console.log(`MCP search_messages raw response: ${searchRaw}`);
});
