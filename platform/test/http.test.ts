import { describe, expect, it } from "vitest";

import type { Env } from "../src/env";
import {
  expiredSessionCookie,
  json,
  preflight,
  readBoundedUtf8Body,
  readObject,
  sessionCookie,
} from "../src/shared/http";

const env = {
  ALLOWED_ORIGINS: "https://clovapi.com,http://localhost:3000",
} as unknown as Env;

function streamRequest(
  chunks: Uint8Array[],
  headers: HeadersInit = {},
): { request: Request; wasCancelled: () => boolean } {
  let index = 0;
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      const chunk = chunks[index];
      index += 1;
      if (chunk) controller.enqueue(chunk);
      else controller.close();
    },
    cancel() {
      cancelled = true;
    },
  });
  const request = new Request("https://api.clovapi.com/api/platform", {
    method: "POST",
    headers,
    body,
    duplex: "half",
  } as RequestInit & { duplex: "half" });
  return { request, wasCancelled: () => cancelled };
}

describe("HTTP contract", () => {
  it("returns credentialed CORS only to configured origins", () => {
    const response = json(
      new Request("https://api.clovapi.com/api/platform", {
        headers: { Origin: "https://clovapi.com" },
      }),
      env,
      200,
      { ok: true },
    );
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("https://clovapi.com");
    expect(response.headers.get("Access-Control-Allow-Credentials")).toBe("true");

    const denied = preflight(
      new Request("https://api.clovapi.com/api/platform", {
        method: "OPTIONS",
        headers: { Origin: "https://untrusted.example" },
      }),
      env,
    );
    expect(denied.status).toBe(403);
    expect(denied.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  it("builds secure HttpOnly session cookies", () => {
    const cookie = sessionCookie("token", new Date("2026-10-20T00:00:00Z"), true);
    expect(cookie).toContain("clovapi_session=token");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Secure");
    expect(expiredSessionCookie(true)).toContain("Max-Age=0");
  });

  it("reads an exact-limit UTF-8 body without using an unbounded buffer", async () => {
    const body = new TextEncoder().encode('{"ok":true}');
    const { request } = streamRequest([body], { "Content-Length": String(body.byteLength) });

    await expect(readBoundedUtf8Body(request, body.byteLength)).resolves.toEqual({
      ok: true,
      text: '{"ok":true}',
    });
  });

  it("cancels a chunked body as soon as it exceeds the limit", async () => {
    const { request, wasCancelled } = streamRequest([
      new TextEncoder().encode("12345"),
      new TextEncoder().encode("6"),
    ]);

    await expect(readBoundedUtf8Body(request, 5)).resolves.toEqual({
      ok: false,
      error: "body_too_large",
    });
    expect(wasCancelled()).toBe(true);
  });

  it("does not trust a smaller declared Content-Length", async () => {
    const { request, wasCancelled } = streamRequest([
      new TextEncoder().encode("1234"),
      new TextEncoder().encode("56"),
    ], { "Content-Length": "1" });

    await expect(readBoundedUtf8Body(request, 5)).resolves.toEqual({
      ok: false,
      error: "body_too_large",
    });
    expect(wasCancelled()).toBe(true);
  });

  it("rejects malformed Content-Length values and malformed UTF-8", async () => {
    for (const contentLength of ["", "-1", "+1", "1.0", "1e0", "1, 2", "NaN"]) {
      const request = new Request("https://api.clovapi.com/api/platform", {
        method: "POST",
        headers: { "Content-Length": contentLength },
        body: "{}",
      });
      await expect(readObject(request, 16)).resolves.toBeNull();
    }

    const { request } = streamRequest([new Uint8Array([0xc3, 0x28])]);
    await expect(readBoundedUtf8Body(request, 2)).resolves.toEqual({
      ok: false,
      error: "invalid_body",
    });
  });
});
