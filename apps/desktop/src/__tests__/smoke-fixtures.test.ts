import type { StoredTotpAccount } from "@authenticator/core";
import { describe, expect, it } from "vitest";

function buildSmokeFixture(count: number): StoredTotpAccount[] {
  const accounts: StoredTotpAccount[] = [];
  for (let index = 0; index < count; index += 1) {
    const n = index + 1;
    accounts.push({
      id: `smoke-${n.toString().padStart(3, "0")}`,
      issuer: `SmokeIssuer${n}`,
      label: `smoke.user.${n}@example.com`,
      secretBase32: "JBSWY3DPEHPK3PXP",
      digits: 6,
      period: 30,
      algorithm: "SHA1",
    });
  }
  return accounts;
}

describe("smoke fixtures", () => {
  it.each([0, 1, 5, 50] as const)("builds deterministic fixture for %s accounts", (count) => {
    const first = buildSmokeFixture(count);
    const second = buildSmokeFixture(count);

    expect(first).toHaveLength(count);
    expect(second).toEqual(first);
    expect(new Set(first.map((account) => account.id)).size).toBe(count);

    if (count > 0) {
      expect(first[0]?.id).toBe("smoke-001");
      expect(first[count - 1]?.id).toBe(`smoke-${count.toString().padStart(3, "0")}`);
    }
  });
});
