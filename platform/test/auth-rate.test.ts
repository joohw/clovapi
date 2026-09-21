import { afterEach, describe, expect, it, vi } from "vitest";

import { AUTH_RATE_POLICIES, evaluateAuthRate } from "../src/control/auth-rate-policy";
import { handleAuthCode } from "../src/control/auth";
import type { Env } from "../src/env";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("auth code rate policy", () => {
  it("enforces the email cooldown and rolling hourly limit", () => {
    const now = 2_000_000;
    expect(evaluateAuthRate([now - 59_999], now, AUTH_RATE_POLICIES.email)).toEqual({
      allowed: false,
      retryAfterMs: 1,
    });
    expect(evaluateAuthRate([now - 60_000], now, AUTH_RATE_POLICIES.email).allowed).toBe(true);

    const hourly = [50, 40, 30, 20, 10].map((minutes) => now - minutes * 60_000);
    expect(evaluateAuthRate(hourly, now, AUTH_RATE_POLICIES.email)).toEqual({
      allowed: false,
      retryAfterMs: 10 * 60_000,
    });
  });

  it("enforces both IP windows and handles historical over-limit rows", () => {
    const now = 4_000_000;
    const fiveRecent = [50, 40, 30, 20, 10].map((seconds) => now - seconds * 1000);
    expect(evaluateAuthRate(fiveRecent, now, AUTH_RATE_POLICIES.ip)).toEqual({
      allowed: false,
      retryAfterMs: 10_000,
    });

    const thirtyOneHourly = Array.from({ length: 31 }, (_, index) => now - (31 - index) * 60_000);
    expect(evaluateAuthRate(thirtyOneHourly, now, AUTH_RATE_POLICIES.ip)).toEqual({
      allowed: false,
      retryAfterMs: 30 * 60_000,
    });
  });
});

describe("auth code route", () => {
  it("claims hashed email and IP gates before touching D1 or Resend", async () => {
    const objectNames: string[] = [];
    const objectCalls: string[] = [];
    const namespace = {
      idFromName(name: string) {
        objectNames.push(name);
        return name;
      },
      get(id: string) {
        return {
          async fetch() {
            objectCalls.push(id);
            const denied = id.startsWith("ip:");
            return Response.json(
              denied ? { ok: false, error: "rate_limited", retryAfterSeconds: 17 } : { ok: true },
              { status: denied ? 429 : 200 },
            );
          },
        };
      },
    };
    const prepare = vi.fn(() => {
      throw new Error("D1 must not be touched after a rejected claim");
    });
    const resend = vi.fn();
    vi.stubGlobal("fetch", resend);

    const env = {
      ALLOWED_ORIGINS: "https://clovapi.com",
      COOKIE_SECURE: "true",
      AUTH_SECRET: "test-auth-secret-at-least-thirty-two-characters",
      RESEND_API_KEY: "test-resend-key",
      RESEND_FROM: "login@clovapi.com",
      AUTH_RATE_GATES: namespace,
      DB: { prepare },
    } as unknown as Env;
    const response = await handleAuthCode(new Request("https://api.clovapi.com/api/auth/code", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://clovapi.com",
        "CF-Connecting-IP": "203.0.113.10",
      },
      body: JSON.stringify({ email: "User@Example.com" }),
    }), env);

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("17");
    await expect(response.json()).resolves.toEqual({ ok: false, error: "rate_limited" });
    expect(objectCalls).toHaveLength(2);
    expect(objectNames).toHaveLength(2);
    expect(objectNames.some((name) => name.startsWith("email:"))).toBe(true);
    expect(objectNames.some((name) => name.startsWith("ip:"))).toBe(true);
    expect(objectNames.join(" ")).not.toContain("user@example.com");
    expect(objectNames.join(" ")).not.toContain("203.0.113.10");
    expect(prepare).not.toHaveBeenCalled();
    expect(resend).not.toHaveBeenCalled();
  });
});
