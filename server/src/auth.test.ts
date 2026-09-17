import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";

process.env.GROUP_ACCESS_CODE = "letmein";
process.env.AUTH_REQUIRED = "true";
process.env.NODE_ENV = "test";

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
});

afterAll(() => {
  delete process.env.GROUP_ACCESS_CODE;
});
