import { createHash } from "node:crypto";

export function hashIdentifier(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

export function summarizeMessage(message: string): { length: number; preview: string } {
  const normalized = message.replace(/\s+/g, " ").trim();
  const preview = normalized.length > 20 ? `${normalized.slice(0, 20)}...` : normalized;

  return {
    length: message.length,
    preview: preview.replace(/[0-9A-Za-zÀ-ÿ]/g, "*")
  };
}
