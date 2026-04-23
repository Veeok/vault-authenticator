import { app } from "electron";
import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";

function getLogFilePath(): string | null {
  try {
    return path.join(app.getPath("userData"), "logs", "dev-diagnostics.log");
  } catch {
    return null;
  }
}

const RECOVERY_SECRET_PATTERN = /(?:[A-HJ-KMNP-Z2-9]{6}-){7}[A-HJ-KMNP-Z2-9]{6}/g;
const OTPAUTH_URI_PATTERN = /otpauth:\/\/[^\s"'<>]+/gi;
const LONG_HEX_PATTERN = /(?<![A-Fa-f0-9])[A-Fa-f0-9]{21,}(?![A-Fa-f0-9])/g;
const LONG_BASE64_PATTERN = /(?<![A-Za-z0-9+/=])[A-Za-z0-9+/]{21,}={0,2}(?![A-Za-z0-9+/=])/g;
const SENSITIVE_KEYS = new Set([
  "password",
  "pin",
  "passphrase",
  "secret",
  "secretbase32",
  "recoverysecret",
  "token",
  "tokenid",
  "sessionid",
  "sessiontoken",
  "sessionidentifier",
  "vaultkey",
  "wrappedkey",
  "plaintextbase64",
  "ciphertext",
  "authtag",
]);

function redactString(value: string): string {
  return value
    .replace(OTPAUTH_URI_PATTERN, "[REDACTED_OTPAUTH_URI]")
    .replace(RECOVERY_SECRET_PATTERN, "[REDACTED_RECOVERY_SECRET]")
    .replace(LONG_HEX_PATTERN, "[REDACTED_HEX]")
    .replace(LONG_BASE64_PATTERN, "[REDACTED_BASE64]");
}

function redactValue(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[TRUNCATED]";
  if (typeof value === "string") return redactString(value);
  if (Array.isArray(value)) return value.map((item) => redactValue(item, depth + 1));
  if (!value || typeof value !== "object") return value;

  const next: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    const normalizedKey = key.replace(/[^a-z0-9]/gi, "").toLowerCase();
    if (SENSITIVE_KEYS.has(normalizedKey)) {
      next[key] = `[REDACTED_${normalizedKey.toUpperCase()}]`;
      continue;
    }
    next[key] = redactValue(entry, depth + 1);
  }
  return next;
}

function toSafeJson(value: unknown): string {
  try {
    return JSON.stringify(redactValue(value));
  } catch {
    return "[unserializable]";
  }
}

export function logDesktopDebug(message: string, details?: unknown): void {
  try {
    if (app.isPackaged) {
      return;
    }

    const logFilePath = getLogFilePath();
    if (!logFilePath) {
      return;
    }

    const safeMessage = redactString(message);
    const safeDetails = details === undefined ? undefined : redactValue(details);
    const suffix = safeDetails === undefined ? "" : ` ${toSafeJson(safeDetails)}`;
    const line = `${new Date().toISOString()} ${safeMessage}${suffix}\n`;

    try {
      // Dev-session visibility for crash investigations.
      // eslint-disable-next-line no-console
      console.log(`[desktop-debug] ${safeMessage}`, safeDetails ?? "");
    } catch {
      // ignore console failures
    }

    try {
      mkdirSync(path.dirname(logFilePath), { recursive: true });
      appendFileSync(logFilePath, line, "utf8");
    } catch {
      // Intentionally swallow debug logging errors.
    }
  } catch {
    // Intentionally swallow debug logging errors.
  }
}

export function getDesktopDebugLogPath(): string {
  return getLogFilePath() ?? "";
}
