import { config, provider } from "../config.js";
export async function transcribe(data: Buffer, filename: string) {
  if (provider === "none") return "";
  const form = new FormData();
  form.append("file", new Blob([data]), filename);
  form.append("model", "whisper-1");
  const r = await fetch(`${config.LLM_BASE_URL}/audio/transcriptions`, {
    method: "POST",
    headers: config.LLM_API_KEY ? { authorization: `Bearer ${config.LLM_API_KEY}` } : {},
    body: form,
  });
  if (!r.ok) throw new Error(await r.text());
  return ((await r.json()) as { text: string }).text;
}
