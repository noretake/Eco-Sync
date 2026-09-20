import path from "node:path";
import QRCode from "qrcode";
import whatsapp from "whatsapp-web.js";
import type { Chat, Message } from "whatsapp-web.js";
import { config } from "../config.js";
import { getSetting, setSetting } from "../db/index.js";
import { ingestMessages } from "../ingest/pipeline.js";
import { answer } from "../rag/answer.js";

const { Client, LocalAuth } = whatsapp;

export type WhatsAppWebStatus = {
  state: "disabled" | "starting" | "qr" | "authenticated" | "ready" | "disconnected";
  qr?: string;
  me?: string;
  botName?: string;
  groups?: Array<{ id: string; name: string }>;
  targetGroup?: string;
  error?: string;
};

export const status: WhatsAppWebStatus = {
  state: config.WHATSAPP_WEB_ENABLED ? "starting" : "disabled",
  groups: [],
};

let client: InstanceType<typeof Client> | undefined;
let initialized = false;
let targetChat: Chat | undefined;

export function extractQuestion(body: string): string | null {
  const match = body.match(/^(@eco|\/ask)\s+(.+)$/is);
  return match?.[2].trim() || null;
}

function targetMatches(chat: Chat) {
  const target = status.targetGroup;
  return Boolean(target && (chat.name === target || chat.id._serialized === target));
}

async function ingestMessage(message: Message, chat: Chat, allowReply: boolean) {
  if (!chat.isGroup || !targetMatches(chat)) return;
  if (message.type !== "chat" && (!message.hasMedia || !message.body)) return;
  const body = message.body.trim();
  if (!body) return;
  const contact = await message.getContact();
  await ingestMessages(
    [
      {
        channel: "whatsapp",
        sender: contact.pushname || contact.number,
        sentAt: new Date(message.timestamp * 1000),
        text: body,
        threadId: chat.id._serialized,
        externalId: message.id._serialized,
      },
    ],
    `WhatsApp Web: ${chat.name}`,
  );
  if (allowReply && !message.fromMe) {
    const question = extractQuestion(body);
    if (question) {
      const result = await answer(question);
      await message.reply(result.answer);
    }
  }
}

export async function handleDirectMessage(
  message: Message,
  _chat: Chat,
  selectedTargetChat = targetChat,
) {
  if (message.fromMe || message.type !== "chat" || !message.body.trim()) return;
  try {
    if (status.targetGroup && selectedTargetChat) {
      const isParticipant =
        selectedTargetChat.participants?.some(
          (participant) => participant.id._serialized === message.from,
        ) ?? false;
      if (!isParticipant) {
        await message.reply("Sorry, Eco Sync only answers members of the group.");
        return;
      }
    }
    const question = extractQuestion(message.body.trim()) ?? message.body.trim();
    const result = await answer(question);
    await message.reply(result.answer);
  } catch (error) {
    status.error = String(error);
  }
}

async function backfill(chat: Chat) {
  const messages = await chat.fetchMessages({ limit: config.WHATSAPP_BACKFILL_LIMIT });
  for (const message of messages) {
    await ingestMessage(message, chat, false);
  }
}

async function initialize() {
  if (initialized) return;
  initialized = true;
  status.state = "starting";
  status.error = undefined;
  try {
    const nextClient = new Client({
      authStrategy: new LocalAuth({ dataPath: path.join(config.DATA_DIR, "wwebjs_auth") }),
      puppeteer: {
        executablePath: config.PUPPETEER_EXECUTABLE_PATH ?? "/usr/bin/google-chrome",
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
      },
    });
    client = nextClient;
    nextClient.on("qr", async (qr) => {
      status.state = "qr";
      status.qr = await QRCode.toDataURL(qr);
    });
    nextClient.on("authenticated", () => {
      status.state = "authenticated";
      status.qr = undefined;
    });
    nextClient.on("ready", async () => {
      status.state = "ready";
      status.me = nextClient.info?.wid?.user;
      const botName = getSetting("whatsapp_bot_name");
      status.botName = botName || undefined;
      if (botName) {
        try {
          await nextClient.setDisplayName(botName);
        } catch (error) {
          status.error = String(error);
        }
      }
      const chats = await nextClient.getChats();
      const groups = chats
        .filter((chat) => chat.isGroup)
        .map((chat) => ({ id: chat.id._serialized, name: chat.name }));
      status.groups = groups;
      const target = status.targetGroup
        ? groups.find(
            (group) => group.name === status.targetGroup || group.id === status.targetGroup,
          )
        : undefined;
      targetChat = undefined;
      if (target) {
        status.targetGroup = target.name;
        targetChat = chats.find((chat) => chat.isGroup && chat.id._serialized === target.id);
        if (targetChat) await backfill(targetChat);
      }
    });
    nextClient.on("message_create", async (message) => {
      try {
        const chat = await message.getChat();
        if (chat.isGroup) await ingestMessage(message, chat, true);
        else await handleDirectMessage(message, chat);
      } catch (error) {
        status.error = String(error);
      }
    });
    nextClient.on("disconnected", (reason) => {
      status.state = "disconnected";
      status.error = reason;
      initialized = false;
      client = undefined;
      targetChat = undefined;
    });
    nextClient.on("auth_failure", (message) => {
      status.state = "disconnected";
      status.error = message;
      initialized = false;
      targetChat = undefined;
    });
    await nextClient.initialize();
  } catch (error) {
    status.state = "disconnected";
    status.error = String(error);
    initialized = false;
    client = undefined;
    targetChat = undefined;
  }
}

export async function startWhatsAppWeb() {
  status.botName = getSetting("whatsapp_bot_name") || undefined;
  if (!config.WHATSAPP_WEB_ENABLED) {
    status.state = "disabled";
    return;
  }
  if (!getSetting("whatsapp_group")) {
    if (config.WHATSAPP_GROUP_NAME) setSetting("whatsapp_group", config.WHATSAPP_GROUP_NAME);
  }
  status.targetGroup = getSetting("whatsapp_group");
  void initialize();
}

export async function setBotName(name: string) {
  setSetting("whatsapp_bot_name", name);
  status.botName = name;
  if (status.state === "ready" && client) await client.setDisplayName(name);
  return status;
}

export async function setTargetGroup(group: string) {
  status.targetGroup = group || undefined;
  targetChat = undefined;
  if (group) setSetting("whatsapp_group", group);
  else setSetting("whatsapp_group", "");
  if (status.state !== "ready" || !client) return;
  const chat = (await client.getChats()).find(
    (candidate) =>
      candidate.isGroup && (candidate.name === group || candidate.id._serialized === group),
  );
  if (chat) {
    targetChat = chat;
    status.targetGroup = chat.name;
    await backfill(chat);
  }
}

export async function logoutWhatsAppWeb() {
  if (client) {
    await client.logout().catch(() => undefined);
    await client.destroy().catch(() => undefined);
  }
  client = undefined;
  initialized = false;
  targetChat = undefined;
  status.state = "starting";
  status.qr = undefined;
  status.me = undefined;
  void initialize();
}
