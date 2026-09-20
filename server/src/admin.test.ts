import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "ecosync-test-"));
process.env.SEED_DEMO = "true";
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

  it("protects WhatsApp bot display-name changes", async () => {
    const unauthorized = await request(app)
      .post("/api/whatsapp/name")
      .send({ name: "ecosync_BOT" });
    expect(unauthorized.status).toBe(401);
    expect(unauthorized.body).toEqual({ error: "unauthorized" });

    const authorized = await request(app)
      .post("/api/whatsapp/name")
      .set("x-admin-token", "test-admin-token")
      .send({ name: "ecosync_BOT" });
    expect(authorized.status).toBe(200);
    expect(authorized.body.botName).toBe("ecosync_BOT");
  });
});

afterAll(() => {
  delete process.env.ADMIN_TOKEN;
});
