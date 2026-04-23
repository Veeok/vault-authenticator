import { createHmac } from "crypto";

export function base32Decode(input: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const clean = input.trim().replace(/\s/g, "").replace(/=/g, "").toUpperCase();
  let buffer = 0;
  let bitsLeft = 0;
  const output: number[] = [];

  for (const char of clean) {
    const val = alphabet.indexOf(char);
    if (val < 0) throw new Error(`Invalid Base32 character: ${char}`);
    buffer = (buffer << 5) | val;
    bitsLeft += 5;
    if (bitsLeft >= 8) {
      bitsLeft -= 8;
      output.push((buffer >> bitsLeft) & 0xff);
    }
  }

  return Buffer.from(output);
}

export interface TotpOptions {
  algorithm?: "SHA1" | "SHA256" | "SHA512";
  digits?: number;
  period?: number;
}

export function totpCodeSync(
  secretBase32: string,
  options: TotpOptions = {}
): { code: string; remainingSeconds: number } {
  const algo = options.algorithm ?? "SHA1";
  const digits = options.digits ?? 6;
  const period = options.period ?? 30;

  const nowSec = Math.floor(Date.now() / 1000);
  const counter = Math.floor(nowSec / period);
  const remainingSeconds = period - (nowSec % period);

  const counterBuf = Buffer.alloc(8);
  const high = Math.floor(counter / 0x100000000);
  const low = counter >>> 0;
  counterBuf.writeUInt32BE(high, 0);
  counterBuf.writeUInt32BE(low, 4);

  const key = base32Decode(secretBase32);
  const hmacAlgo = algo === "SHA256" ? "sha256" : algo === "SHA512" ? "sha512" : "sha1";
  const hash = createHmac(hmacAlgo, key).update(counterBuf).digest();

  const offset = hash[hash.length - 1] & 0x0f;
  const binary =
    ((hash[offset] & 0x7f) << 24) |
    ((hash[offset + 1] & 0xff) << 16) |
    ((hash[offset + 2] & 0xff) << 8) |
    (hash[offset + 3] & 0xff);

  const mod = Math.pow(10, digits);
  const otp = binary % mod;
  const code = otp.toString().padStart(digits, "0");

  return { code, remainingSeconds };
}
