import { describe, expect, it } from "vitest";

import {
  connectionKeyUsesOrigin,
  createConnectionKey,
  normalizeDeviceId,
  normalizeEmail,
  normalizeOrigin,
  safeInteger,
} from "../src/shared/validation";

describe("control-plane validation", () => {
  it("embeds the canonical public origin into connection keys", () => {
    const key = createConnectionKey("https://api.clovapi.com/");
    expect(key).toMatch(/^clv_connect_[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{22}$/u);
    expect(connectionKeyUsesOrigin(key ?? "", "https://api.clovapi.com")).toBe(true);
    expect(connectionKeyUsesOrigin(key ?? "", "https://other.example")).toBe(false);
  });

  it("only accepts HTTPS origins except for loopback development", () => {
    expect(normalizeOrigin("https://api.clovapi.com/")).toBe("https://api.clovapi.com");
    expect(normalizeOrigin("http://localhost:8787")).toBe("http://localhost:8787");
    expect(normalizeOrigin("http://api.clovapi.com")).toBeNull();
    expect(normalizeOrigin("https://api.clovapi.com/path")).toBeNull();
  });

  it("normalizes account and node-registration inputs", () => {
    expect(normalizeEmail(" User@Example.COM ")).toBe("user@example.com");
    expect(normalizeEmail("user@example")).toBeNull();
    expect(normalizeDeviceId("26E5B4BD-20D2-4F67-A3C0-0E4DCEDB60BF")).toBe(
      "26e5b4bd-20d2-4f67-a3c0-0e4dcedb60bf",
    );
    expect(safeInteger(100_000, 1, 100_000)).toBe(100_000);
    expect(safeInteger(1.5, 1, 100_000)).toBeNull();
  });
});
