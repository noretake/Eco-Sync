import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";

process.env.ADMIN_TOKEN = "test-admin-token";

const { app } = await import("./index.js");

describe("admin authorization", () => {
  it("protects WhatsApp group changes", async () => {
    const unauthorized = await request(app).post("/api/whatsapp/group").send({ group: "Eco Sync" });
    expect(unauthorized.status).toBe(401);
    expect(unauthorized.body).toEqual({ error: "unauthorized" });

    const authorized = await request(app)
      .post("/api/whatsapp/group")
      .set("x-admin-token", "test-admin-token")
      .send({ group: "Eco Sync" });
    expect(authorized.status).not.toBe(401);
  });
});

afterAll(() => {
  delete process.env.ADMIN_TOKEN;
});
