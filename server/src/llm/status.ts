let lastError: string | undefined;
let errorSequence = 0;
let lastWarningAt = 0;

function shortReason(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const code = message.match(/"code"\s*:\s*"([^"]+)"/)?.[1];
  if (code) return code;
  const status = message.match(/\bLLM\s+(\d{3})\b/)?.[1];
  if (status) return `HTTP ${status}`;
  return message.split(/\r?\n/, 1)[0].slice(0, 80) || "provider error";
}

export function noteLlmError(error: unknown) {
  const reason = shortReason(error);
  lastError = reason;
  errorSequence += 1;
  const now = Date.now();
  if (now - lastWarningAt >= 60_000) {
    console.warn(`AI provider degraded: ${reason}`);
    lastWarningAt = now;
  }
  return reason;
}

export function llmErrorSequence() {
  return errorSequence;
}

export function llmHealth() {
  return lastError ? `degraded: ${lastError}` : "ok";
}

export function llmLastError() {
  return lastError ?? "provider error";
}
