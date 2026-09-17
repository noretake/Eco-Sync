import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";

fs.mkdirSync(config.DATA_DIR, { recursive: true });
export const db = new Database(path.join(config.DATA_DIR, "ecosync.db"));
db.pragma("journal_mode = WAL");
db.exec(`
CREATE TABLE IF NOT EXISTS sources(id INTEGER PRIMARY KEY, kind TEXT NOT NULL, name TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS messages(id INTEGER PRIMARY KEY, source_id INTEGER NOT NULL, channel TEXT NOT NULL, sender TEXT NOT NULL, sent_at TEXT NOT NULL, text TEXT NOT NULL, thread_id TEXT, raw_json TEXT, external_id TEXT UNIQUE, FOREIGN KEY(source_id) REFERENCES sources(id));
CREATE TABLE IF NOT EXISTS chunks(id INTEGER PRIMARY KEY, message_id INTEGER, source_id INTEGER NOT NULL, channel TEXT NOT NULL, sender TEXT NOT NULL, sent_at TEXT NOT NULL, content TEXT NOT NULL, embedding BLOB, FOREIGN KEY(message_id) REFERENCES messages(id));
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS users(
  id INTEGER PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions(
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS conversations(
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS turns(
  id INTEGER PRIMARY KEY,
  conversation_id INTEGER NOT NULL,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  sources_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);
CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(content, content='chunks', content_rowid='id');
CREATE TRIGGER IF NOT EXISTS chunks_ai AFTER INSERT ON chunks BEGIN INSERT INTO chunks_fts(rowid,content) VALUES (new.id,new.content); END;
CREATE TRIGGER IF NOT EXISTS chunks_ad AFTER DELETE ON chunks BEGIN INSERT INTO chunks_fts(chunks_fts,rowid,content) VALUES('delete',old.id,old.content); END;
CREATE TRIGGER IF NOT EXISTS chunks_au AFTER UPDATE ON chunks BEGIN INSERT INTO chunks_fts(chunks_fts,rowid,content) VALUES('delete',old.id,old.content); INSERT INTO chunks_fts(rowid,content) VALUES(new.id,new.content); END;
`);
const messageColumns = db.prepare("PRAGMA table_info(messages)").all() as Array<{ name: string }>;
if (!messageColumns.some((column) => column.name === "external_id")) {
  db.exec("ALTER TABLE messages ADD COLUMN external_id TEXT");
}
db.exec("CREATE UNIQUE INDEX IF NOT EXISTS messages_external_id_idx ON messages(external_id)");

export function getSetting(key: string) {
  return (
    db.prepare("SELECT value FROM settings WHERE key=?").get(key) as { value: string } | undefined
  )?.value;
}

export function setSetting(key: string, value: string) {
  db.prepare(
    "INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
  ).run(key, value);
}

export function source(kind: string, name: string) {
  const row = db.prepare("SELECT id FROM sources WHERE kind=? AND name=?").get(kind, name) as
    | { id: number }
    | undefined;
  if (row) return row.id;
  const created = db
    .prepare("INSERT INTO sources(kind,name) VALUES(?,?) RETURNING id")
    .get(kind, name) as { id: number };
  return created.id;
}
