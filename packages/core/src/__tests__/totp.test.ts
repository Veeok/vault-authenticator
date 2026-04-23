import { describe, it, expect } from "vitest";
import { createHmac } from "crypto";
import { totpCodeSync } from "../totp";

function totpAtTime(
  secretAscii: string,
  unixSec: number,
  digits: number,
  algo: "SHA1" | "SHA256" | "SHA512"
): string {
  const period = 30;
  const counter = Math.floor(unixSec / period);
  const counterBuf = Buffer.alloc(8);
  const high = Math.floor(counter / 0x100000000);
  const low = counter >>> 0;
  counterBuf.writeUInt32BE(high, 0);
  counterBuf.writeUInt32BE(low, 4);

  const key = Buffer.from(secretAscii, "ascii");
  const hmacAlgo = algo === "SHA256" ? "sha256" : algo === "SHA512" ? "sha512" : "sha1";
  const hash = createHmac(hmacAlgo, key).update(counterBuf).digest();

  const offset = hash[hash.length - 1] & 0x0f;
  const binary =
    ((hash[offset] & 0x7f) << 24) |
    ((hash[offset + 1] & 0xff) << 16) |
    ((hash[offset + 2] & 0xff) << 8) |
    (hash[offset + 3] & 0xff);

  const mod = Math.pow(10, digits);
  return (binary % mod).toString().padStart(digits, "0");
}

const SHA1_SECRET = "12345678901234567890";
const SHA256_SECRET = "12345678901234567890123456789012";
const SHA512_SECRET = "1234567890123456789012345678901234567890123456789012345678901234";

describe("RFC 6238 Appendix B vectors (8 digits)", () => {
  const vectors: Array<[number, string, string, string]> = [
    [59, "94287082", "46119246", "90693936"],
    [1111111109, "07081804", "68084774", "25091201"],
    [1111111111, "14050471", "67062674", "99943326"],
    [1234567890, "89005924", "91819424", "93441116"],
    [2000000000, "69279037", "90698825", "38618901"],
    [20000000000, "65353130", "77737706", "47863826"],
  ];

  for (const [time, sha1, sha256, sha512] of vectors) {
    it(`T=${time} SHA1 -> ${sha1}`, () => {
      expect(totpAtTime(SHA1_SECRET, time, 8, "SHA1")).toBe(sha1);
    });
    it(`T=${time} SHA256 -> ${sha256}`, () => {
      expect(totpAtTime(SHA256_SECRET, time, 8, "SHA256")).toBe(sha256);
    });
    it(`T=${time} SHA512 -> ${sha512}`, () => {
      expect(totpAtTime(SHA512_SECRET, time, 8, "SHA512")).toBe(sha512);
    });
  }
});

describe("totpCodeSync live (6 digits, SHA1, period 30)", () => {
  it("returns a 6-char numeric string", () => {
    const { code, remainingSeconds } = totpCodeSync("JBSWY3DPEHPK3PXP");
    expect(code).toMatch(/^\d{6}$/);
    expect(remainingSeconds).toBeGreaterThan(0);
    expect(remainingSeconds).toBeLessThanOrEqual(30);
  });
});
