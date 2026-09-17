import path from "node:path";
import dotenv from "dotenv";
import { z } from "zod";

dotenv.config({ path: path.resolve(process.cwd(), "../.env") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const schema = z.object({
  PORT: z.coerce.number().default(8787),
  DATA_DIR: z.string().default("./data"),
  LLM_BASE_URL: z.string().default("https://api.openai.com/v1"),
  LLM_API_KEY: z.string().optional(),
  LLM_MODEL: z.string().default("gpt-4o-mini"),
  EMBED_MODEL: z.string().default("text-embedding-3-small"),
  WHATSAPP_VERIFY_TOKEN: z.string().optional(),
  WHATSAPP_TOKEN: z.string().optional(),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  WHATSAPP_REPLY_ALL: z
    .string()
    .transform((v) => v === "true")
    .default("false"),
  WHATSAPP_WEB_ENABLED: z
    .string()
    .transform((v) => v === "true")
    .default("false"),
  WHATSAPP_GROUP_NAME: z.string().optional(),
  WHATSAPP_BACKFILL_LIMIT: z.coerce.number().default(300),
  PUPPETEER_EXECUTABLE_PATH: z.string().optional(),
  EMAIL_IMAP_HOST: z.string().optional(),
  EMAIL_IMAP_PORT: z.coerce.number().default(993),
  EMAIL_IMAP_USER: z.string().optional(),
  EMAIL_IMAP_PASS: z.string().optional(),
  EMAIL_SMTP_HOST: z.string().optional(),
  EMAIL_SMTP_PORT: z.coerce.number().default(587),
  EMAIL_BOT_ADDRESS: z.string().optional(),
  EMAIL_POLL_SECONDS: z.coerce.number().default(60),
  TEAMS_TENANT_ID: z.string().optional(),
  TEAMS_CLIENT_ID: z.string().optional(),
  TEAMS_CLIENT_SECRET: z.string().optional(),
  TEAMS_TEAM_ID: z.string().optional(),
  TEAMS_CHANNEL_ID: z.string().optional(),
  TEAMS_POLL_SECONDS: z.coerce.number().default(300),
});
export const config = schema.parse(process.env);
export const provider =
  config.LLM_API_KEY || config.LLM_BASE_URL !== "https://api.openai.com/v1"
    ? "openai-compatible"
    : "none";
