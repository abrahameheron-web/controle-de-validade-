import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./appAuth";

describe("employee password storage", () => {
  it("stores a salted derived value instead of the password", async () => {
    const password = "private-test-password-2026";
    const stored = await hashPassword(password);
    expect(stored).not.toContain(password);
    expect(stored).toMatch(/^[a-f0-9]{32}:[a-f0-9]{128}$/);
    expect(await verifyPassword(password, stored)).toBe(true);
  });

  it("rejects a different password and creates unique salts", async () => {
    const first = await hashPassword("test-password-one");
    const second = await hashPassword("test-password-one");
    expect(first).not.toBe(second);
    expect(await verifyPassword("wrong-password", first)).toBe(false);
  });

  it("rejects malformed stored hashes", async () => {
    expect(await verifyPassword("any-password", "not-a-hash")).toBe(false);
  });
});
