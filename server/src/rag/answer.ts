import { db } from "../db/index.js";
import { provider, complete } from "../llm/provider.js";
import { formatHumanTimestamp } from "../ingest/chunk.js";
import { retrieve } from "./retrieve.js";

export type Source = {
  channel: string;
  sender: string;
  date: string;
  content?: string;
};

const stopwords = new Set([
  "a",
  "about",
  "an",
  "and",
  "are",
  "be",
  "by",
  "for",
  "from",
  "in",
  "is",
  "it",
  "of",
  "on",
  "or",
  "the",
  "to",
  "was",
  "what",
  "when",
  "where",
  "who",
  "with",
]);

function sourceOf(row: {
  channel: string;
  sender: string;
  sent_at: string;
  content?: string;
  text?: string;
}): Source {
  return {
    channel: row.channel,
    sender: row.sender,
    date: new Date(row.sent_at).toISOString().slice(0, 10),
    content: row.content ?? row.text,
  };
}

function terms(value: string) {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((term) => term && !stopwords.has(term))
    .map((term) => term.replace(/(?:ing|es|s)$/i, ""));
}

function matches(candidate: string, term: string) {
  if (candidate === term) return true;
  const stem = Math.min(candidate.length, term.length);
  return stem >= 4 && candidate.slice(0, stem) === term.slice(0, stem);
}

function channelLabel(channel: string) {
  if (channel === "whatsapp") return "WhatsApp";
  return channel.charAt(0).toUpperCase() + channel.slice(1);
}

function lexicalAnswer(
  question: string,
  rows: Array<{
    channel: string;
    sender: string;
    sent_at: string;
    content: string;
  }>,
) {
  const queryTerms = terms(question);
  const candidates = rows.flatMap((row) =>
    row.content.split("\n").flatMap((line) => {
      const timestamped = line.match(/^\[(\d{2} \w{3} \d{4} \d{2}:\d{2})\]\s+([^:]+):\s+(.+)$/);
      const transcript = line.match(/^\[([^\]]+)\]\s+(.+)$/);
      if (!timestamped && !transcript) return [];
      const date = timestamped?.[1] ?? formatHumanTimestamp(row.sent_at, false);
      const sender = timestamped?.[2] ?? transcript?.[1] ?? row.sender;
      const text = timestamped?.[3] ?? transcript?.[2] ?? line;
      const lineTerms = terms(text);
      const score =
        queryTerms.reduce(
          (total, term) =>
            total + (lineTerms.some((candidate) => matches(candidate, term)) ? 1 : 0),
          0,
        ) + (queryTerms.includes("meet") && /\b\d{1,2}:\d{2}\b/.test(text) ? 2 : 0);
      return [{ channel: row.channel, sender, date, text, score }];
    }),
  );

  const selected = candidates
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score)
    .filter(
      (candidate, index, all) => all.findIndex((item) => item.text === candidate.text) === index,
    )
    .slice(0, 5);

  if (!selected.length) {
    return "I couldn't find that in the group's memory.\n\nLexical mode — add LLM_API_KEY for AI-written answers.";
  }
  return `${selected
    .map((line) => `• ${line.sender} (${channelLabel(line.channel)}, ${line.date}): ${line.text}`)
    .join("\n")}\n\nLexical mode — add LLM_API_KEY for AI-written answers.`;
}

export async function answer(question: string, channel?: string) {
  const rows = await retrieve(question, 8, channel);
  const sources = rows.map(sourceOf);
  if (provider === "none") {
    return { answer: lexicalAnswer(question, rows), sources };
  }

  const context = rows.map((row, index) => `[${index + 1}] ${row.content}`).join("\n\n");
  const text = await complete([
    {
      role: "system",
      content:
        "You are Eco Sync, the group's memory. Answer only from context; cite sources as [channel · sender · date]; if not found say so.",
    },
    {
      role: "user",
      content: `Context:\n${context}\n\nQuestion: ${question}`,
    },
  ]);
  return { answer: text, sources };
}

export async function catchUp(since: Date, channel?: string) {
  const rows = db
    .prepare(
      `SELECT channel,sender,sent_at,text FROM messages
       WHERE sent_at>=? ${channel ? "AND channel=?" : ""} ORDER BY sent_at`,
    )
    .all(...(channel ? [since.toISOString(), channel] : [since.toISOString()])) as Array<{
    channel: string;
    sender: string;
    sent_at: string;
    text: string;
  }>;
  if (!rows.length) return { answer: "No messages found in that period.", sources: [] };
  if (provider === "none") {
    return {
      answer: rows
        .map((row) => `- ${new Date(row.sent_at).toLocaleDateString()} ${row.sender}: ${row.text}`)
        .join("\n"),
      sources: rows.slice(0, 8).map(sourceOf),
    };
  }
  const digest = rows
    .map((row) => `[${formatHumanTimestamp(row.sent_at, true)}] ${row.sender}: ${row.text}`)
    .join("\n");
  const text = await complete([
    {
      role: "system",
      content:
        "You are Eco Sync, the group's memory. Summarise the messages below as short bullet lists under the headings Decisions, Open questions, Deadlines & action items. Mention who said what and the date.",
    },
    { role: "user", content: digest },
  ]);
  return { answer: text, sources: rows.slice(0, 8).map(sourceOf) };
}
