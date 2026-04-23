import type { TotpAccount, Algorithm } from "./types";

const VALID_ALGORITHMS = new Set<string>(["SHA1", "SHA256", "SHA512"]);
const VALID_DIGITS = new Set<number>([6, 8]);

export function parseOtpauthUri(raw: string): TotpAccount {
  let uri: URL;
  try {
    uri = new URL(raw);
  } catch {
    throw new Error("Malformed URI: cannot parse");
  }

  if (uri.protocol !== "otpauth:") {
    throw new Error(`Invalid scheme: expected otpauth, got ${uri.protocol}`);
  }
  if (uri.hostname !== "totp") {
    throw new Error(`Only TOTP is supported, got: ${uri.hostname}`);
  }

  const params = uri.searchParams;

  const secrets = params.getAll("secret");
  if (secrets.length === 0) throw new Error("Missing required parameter: secret");
  if (secrets.length > 1) throw new Error("Duplicate parameter: secret");
  const secret = secrets[0].replace(/\s/g, "").replace(/=/g, "").toUpperCase();
  if (!/^[A-Z2-7]+$/.test(secret)) throw new Error("secret is not valid Base32");

  for (const param of ["algorithm", "digits", "period", "issuer"]) {
    if (params.getAll(param).length > 1) {
      throw new Error(`Duplicate parameter: ${param}`);
    }
  }

  const algorithmRaw = (params.get("algorithm") ?? "SHA1").toUpperCase();
  if (!VALID_ALGORITHMS.has(algorithmRaw)) {
    throw new Error(`Unsupported algorithm: ${algorithmRaw}`);
  }
  const algorithm = algorithmRaw as Algorithm;

  const digitsRaw = parseInt(params.get("digits") ?? "6", 10);
  if (!VALID_DIGITS.has(digitsRaw)) {
    throw new Error(`digits must be 6 or 8, got: ${digitsRaw}`);
  }
  const digits = digitsRaw as 6 | 8;

  const period = parseInt(params.get("period") ?? "30", 10);
  if (!Number.isInteger(period) || period < 1 || period > 300) {
    throw new Error(`period out of valid range (1-300): ${period}`);
  }
  if (period !== 30 && period !== 60) {
    console.warn(`Uncommon TOTP period: ${period} seconds`);
  }

  const rawPath = decodeURIComponent(uri.pathname.replace(/^\//, ""));
  const colonIdx = rawPath.indexOf(":");
  const issuerFromPath = colonIdx > 0 ? rawPath.slice(0, colonIdx).trim() : "";
  const label = colonIdx > 0 ? rawPath.slice(colonIdx + 1).trim() : rawPath.trim();

  const issuer = (params.get("issuer") ?? issuerFromPath).trim();

  return {
    issuer,
    label: label || issuer || "Unknown",
    secretBase32: secret,
    digits,
    period,
    algorithm,
  };
}
