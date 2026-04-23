import { describe, it, expect } from "vitest";
import { parseOtpauthUri } from "../parser";

describe("parseOtpauthUri", () => {
  it("parses a standard URI", () => {
    const acc = parseOtpauthUri(
      "otpauth://totp/GitHub:user@example.com?secret=JBSWY3DPEHPK3PXP&issuer=GitHub"
    );
    expect(acc.issuer).toBe("GitHub");
    expect(acc.label).toBe("user@example.com");
    expect(acc.secretBase32).toBe("JBSWY3DPEHPK3PXP");
    expect(acc.digits).toBe(6);
    expect(acc.period).toBe(30);
    expect(acc.algorithm).toBe("SHA1");
  });

  it("uses path issuer if query issuer is absent", () => {
    const acc = parseOtpauthUri(
      "otpauth://totp/Acme:bob@acme.com?secret=JBSWY3DPEHPK3PXP"
    );
    expect(acc.issuer).toBe("Acme");
    expect(acc.label).toBe("bob@acme.com");
  });

  it("handles URL-encoded label", () => {
    const acc = parseOtpauthUri(
      "otpauth://totp/My%20Service%3Auser%40example.com?secret=JBSWY3DPEHPK3PXP"
    );
    expect(acc.label).toBe("user@example.com");
    expect(acc.issuer).toBe("My Service");
  });

  it("accepts 8-digit tokens", () => {
    const acc = parseOtpauthUri(
      "otpauth://totp/Test:a@b.com?secret=JBSWY3DPEHPK3PXP&digits=8"
    );
    expect(acc.digits).toBe(8);
  });

  it("throws on missing secret", () => {
    expect(() => parseOtpauthUri("otpauth://totp/Test:a@b.com?issuer=Test")).toThrow(
      "Missing required parameter: secret"
    );
  });

  it("throws on invalid Base32 in secret", () => {
    expect(() => parseOtpauthUri("otpauth://totp/Test:a@b.com?secret=NOT_BASE32!!")).toThrow(
      "not valid Base32"
    );
  });

  it("throws on duplicate secret param", () => {
    expect(() =>
      parseOtpauthUri(
        "otpauth://totp/Test:a@b.com?secret=JBSWY3DPEHPK3PXP&secret=JBSWY3DPEHPK3PXP"
      )
    ).toThrow("Duplicate parameter: secret");
  });
});
