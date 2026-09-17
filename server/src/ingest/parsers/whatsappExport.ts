import type { NormalizedMessage } from "../normalize.js";
const patterns = [
  /^(\d{1,2}\/\d{1,2}\/\d{2,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?)\s*[-\]]\s*([^:]+):\s?(.*)$/,
  /^\[(\d{1,2}\/\d{1,2}\/\d{2,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?)\]\s*([^:]+):\s?(.*)$/,
];
export function parseWhatsApp(text: string): NormalizedMessage[] {
  const out: NormalizedMessage[] = [];
  let current: NormalizedMessage | undefined;
  for (const line of text.replace(/\r/g, "").split("\n")) {
    const m = patterns.map((p) => line.match(p)).find(Boolean);
    if (m) {
      if (current?.text) out.push(current);
      const [, d, t, s, msg] = m!;
      const [day, month, year] = d.split("/").map(Number);
      const y = year < 100 ? 2000 + year : year;
      current = {
        channel: "whatsapp",
        sender: s.trim(),
        sentAt: new Date(y, month - 1, day, ...t.split(":").map(Number)),
        text: msg.trim(),
      };
    } else if (current && line.trim()) current.text += `\n${line.trim()}`;
  }
  if (current?.text) out.push(current);
  return out.filter(
    (m) =>
      m.text &&
      !/joined using this group's invite link|<Media omitted>|end-to-end encrypted/i.test(m.text),
  );
}
