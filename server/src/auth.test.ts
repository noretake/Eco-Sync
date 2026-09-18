import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";
import request from "supertest";

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "ecosync-test-"));
process.env.SEED_DEMO = "true";
process.env.GROUP_ACCESS_CODE = "letmein";
process.env.AUTH_REQUIRED = "true";
process.env.NODE_ENV = "test";
process.env.GOOGLE_CLIENT_ID = "test-client-id";
process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";

const { app } = await import("./index.js");

describe("member authentication and saved sessions", () => {
  const agent = request.agent(app);
  const email = `member-${Date.now()}@example.test`;

  it("rejects signup with the wrong group code", async () => {
    const response = await request(app).post("/api/auth/signup").send({
      name: "Member",
      email,
      password: "password123",
      accessCode: "wrong",
    });
    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: "invalid access code" });
  });

  it("signs up, saves chat history, and logs out", async () => {
    const signup = await agent.post("/api/auth/signup").send({
      name: "Member",
      email,
      password: "password123",
      accessCode: "letmein",
    });
    expect(signup.status).toBe(200);
    expect(signup.body.user).toMatchObject({ name: "Member", email });

    const me = await agent.get("/api/auth/me");
    expect(me.body.user).toMatchObject({ name: "Member", email });

    const unauthenticated = await request(app)
      .post("/api/chat")
      .send({ question: "When is the next meeting?" });
    expect(unauthenticated.status).toBe(401);

    const chat = await agent.post("/api/chat").send({ question: "When is the next meeting?" });
    expect(chat.status).toBe(200);
    expect(chat.body.conversationId).toEqual(expect.any(Number));

    const history = await agent.get("/api/conversations");
    expect(history.status).toBe(200);
    expect(history.body).toHaveLength(1);

    const conversation = await agent.get(`/api/conversations/${history.body[0].id}`);
    expect(conversation.body.turns).toHaveLength(1);

    await agent.post("/api/auth/logout").expect(200);
    const loggedOut = await agent.get("/api/auth/me");
    expect(loggedOut.body.user).toBeNull();
  });

  it("starts Google OAuth and sets a state cookie", async () => {
    const response = await request(app)
      .get("/api/auth/google/start?accessCode=letmein")
      .expect(302);
    expect(response.headers.location).toMatch(
      /^https:\/\/accounts\.google\.com\/o\/oauth2\/v2\/auth\?/,
    );
    expect(response.headers.location).toContain("state=");
    expect(
      response.headers["set-cookie"]?.some((cookie: string) => cookie.startsWith("eco_oauth=")),
    ).toBe(true);
  });

  it("rejects a Google callback with a missing or mismatched state", async () => {
    const response = await request(app)
      .get("/api/auth/google/callback?code=abc&state=wrong")
      .expect(302);
    expect(response.headers.location).toBe("/?auth_error=state");
  });

  it("creates a session from a verified Google profile", async () => {
    const agent = request.agent(app);
    const start = await agent.get("/api/auth/google/start?accessCode=letmein").expect(302);
    const state = new URL(start.headers.location).searchParams.get("state");
    expect(state).toBeTruthy();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url === "https://oauth2.googleapis.com/token") {
          return {
            ok: true,
            json: async () => ({ access_token: "t" }),
          } as Response;
        }
        return {
          ok: true,
          json: async () => ({
            sub: "g1",
            email: "gina@example.com",
            email_verified: true,
            name: "Gina",
          }),
        } as Response;
      }),
    );
    const callback = await agent
      .get(`/api/auth/google/callback?code=abc&state=${state}`)
      .expect(302);
    expect(callback.headers.location).toBe("/");
    expect(
      callback.headers["set-cookie"]?.some((cookie: string) => cookie.startsWith("eco_session=")),
    ).toBe(true);
    const me = await agent.get("/api/auth/me");
    expect(me.body.user).toMatchObject({ email: "gina@example.com", name: "Gina" });
  });
});

afterAll(() => {
  delete process.env.GROUP_ACCESS_CODE;
  delete process.env.GOOGLE_CLIENT_ID;
  delete process.env.GOOGLE_CLIENT_SECRET;
  vi.unstubAllGlobals();
});
