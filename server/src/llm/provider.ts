import { config, provider } from "../config.js";
export { provider };
async function call(path: string, body: unknown) {
  const r = await fetch(`${config.LLM_BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(config.LLM_API_KEY ? { authorization: `Bearer ${config.LLM_API_KEY}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`LLM ${r.status}: ${await r.text()}`);
  return r.json() as Promise<any>;
}
export async function embed(text: string): Promise<number[] | undefined> {
  if (provider === "none") return;
  const j = await call("/embeddings", { model: config.EMBED_MODEL, input: text });
  return j.data?.[0]?.embedding;
}
export async function complete(messages: { role: string; content: string }[]): Promise<string> {
  const j = await call("/chat/completions", {
    model: config.LLM_MODEL,
    messages,
    temperature: 0.2,
  });
  return j.choices?.[0]?.message?.content ?? "";
}
