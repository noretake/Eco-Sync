export type NormalizedMessage = {
  channel: "whatsapp" | "email" | "teams" | "upload";
  sender: string;
  sentAt: Date | string;
  text: string;
  threadId?: string;
  attachments?: string[];
};
const noise = [
  /^<Media omitted>$/i,
  /joined using this group's invite link/i,
  /^Messages and calls are end-to-end encrypted/i,
];
export function normalize(input: NormalizedMessage): NormalizedMessage {
  let text = input.text
    .replace(/\r/g, "")
    .split("\n")
    .filter((line) => !noise.some((r) => r.test(line.trim())))
    .join("\n")
    .trim();
  if (input.channel === "email")
    text = text
      .split(/\nOn .*wrote:\n/i)[0]
      .replace(/--\s*\n[\s\S]*$/, "")
      .trim();
  return { ...input, text, sentAt: new Date(input.sentAt) };
}
