import { db } from "../db/index.js";
import { embed } from "../llm/provider.js";
type Row = {
  id: number;
  channel: string;
  sender: string;
  sent_at: string;
  content: string;
  source_id: number;
  embedding?: Buffer;
  rank?: number;
};
function cosine(a: Float32Array, b: number[]) {
  let x = 0,
    y = 0,
    z = 0;
  for (let i = 0; i < a.length; i++) {
    x += a[i] * (b[i] ?? 0);
    y += a[i] * a[i];
    z += (b[i] ?? 0) ** 2;
  }
  return x / (Math.sqrt(y * z) || 1);
}
export async function retrieve(query: string, k = 8, channel?: string) {
  const match =
    query
      .replace(/[^\w\s]/g, " ")
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .join(" OR ") || "*";
  const fts = db
    .prepare(
      `SELECT c.*,bm25(chunks_fts) rank FROM chunks_fts JOIN chunks c ON c.id=chunks_fts.rowid WHERE chunks_fts MATCH ? ${channel ? "AND c.channel=?" : ""} ORDER BY rank LIMIT 20`,
    )
    .all(...(channel ? [match, channel] : [match])) as Row[];
  const e = await embed(query);
  const all = e
    ? (db
        .prepare(`SELECT * FROM chunks ${channel ? "WHERE channel=?" : ""}`)
        .all(...(channel ? [channel] : [])) as Row[])
    : [];
  const scores = new Map<number, number>();
  fts.forEach((r, i) => scores.set(r.id, (scores.get(r.id) || 0) + 1 / (60 + i + 1)));
  if (e)
    all
      .filter((r) => r.embedding)
      .map((r) => ({
        ...r,
        sim: cosine(
          new Float32Array(
            r.embedding!.buffer,
            r.embedding!.byteOffset,
            r.embedding!.byteLength / 4,
          ),
          e,
        ),
      }))
      .sort((a, b) => b.sim - a.sim)
      .slice(0, 20)
      .forEach((r, i) => scores.set(r.id, (scores.get(r.id) || 0) + 1 / (60 + i + 1)));
  const ids = [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, k)
    .map((x) => x[0]);
  if (!ids.length) return [];
  const placeholders = ids.map(() => "?").join(",");
  return db
    .prepare(
      `SELECT id,channel,sender,sent_at,content,source_id FROM chunks WHERE id IN (${placeholders})`,
    )
    .all(...ids) as Row[];
}
