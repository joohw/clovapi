import { describe, expect, it } from "vitest";
import {
  MAX_REQUEST_BYTES,
  compareAuthGeneration,
  decodeBase64,
  isAdmissionRejected,
  mergeUsageSnapshot,
  normalizeWireModels,
  parseRelayWireMessage,
  readRelayRequest,
  relayError,
  validContentType,
  validModelList,
} from "../src/relay/protocol";

function streamedRelayRequest(
  chunks: Uint8Array[],
  contentLength?: string,
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
  const headers = new Headers({ "Content-Type": "application/json" });
  if (contentLength !== undefined) headers.set("Content-Length", contentLength);
  const request = new Request("https://api.clovapi.com/v1/responses", {
    method: "POST",
    headers,
    body,
    duplex: "half",
  } as RequestInit & { duplex: "half" });
  return { request, wasCancelled: () => cancelled };
}

async function expectRelayError(result: Awaited<ReturnType<typeof readRelayRequest>>, status: number, code: string) {
  expect(result).toBeInstanceOf(Response);
  if (!(result instanceof Response)) return;
  expect(result.status).toBe(status);
  await expect(result.json()).resolves.toMatchObject({ error: { code } });
}

describe("relay protocol validation", () => {
  it("accepts the Go relay wire defaults and canonical base64", () => {
    expect(parseRelayWireMessage(JSON.stringify({ type: "headers", id: "r1", status: 200, contentType: "application/json" })))
      .toMatchObject({ type: "headers", id: "r1", status: 200 });
    expect([...decodeBase64("aGVsbG8=")!]).toEqual([104, 101, 108, 108, 111]);
    expect(decodeBase64("aGVsbG8")).toBeNull();
  });

  it("bounds models and response content types", () => {
    expect(validModelList(["gpt-5.4", "provider/model:v1"])).toBe(true);
    expect(validModelList(["gpt-5.4", "gpt-5.4"])).toBe(false);
    expect(validModelList(["../escape"])).toBe(false);
    expect(validContentType("text/event-stream; charset=utf-8")).toBe(true);
    expect(validContentType("text/html")).toBe(false);
    expect(validContentType("application/json\r\nX-Evil: true")).toBe(false);
  });

  it("treats an omitted Go omitempty models field as an empty inventory", () => {
    const hello = parseRelayWireMessage(JSON.stringify({ type: "hello", protocol: 1, concurrency: 5 }));
    expect(hello).not.toBeNull();
    expect(normalizeWireModels(hello?.models)).toEqual([]);
    expect(normalizeWireModels(null)).toBeNull();
    expect(normalizeWireModels(["gpt-5.4"])).toEqual(["gpt-5.4"]);
  });

  it("validates request model and stream without rewriting its object", async () => {
    const request = new Request("https://api.clovapi.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ model: "gpt-5.4", stream: true, messages: [{ role: "user", content: "hi" }] }),
    });
    const result = await readRelayRequest(request);
    expect(result).not.toBeInstanceOf(Response);
    if (result instanceof Response) return;
    expect(result.body.model).toBe("gpt-5.4");
    expect(result.body.stream).toBe(true);
  });

  it("rejects invalid stream types and oversized bodies", async () => {
    const invalid = await readRelayRequest(new Request("https://api.clovapi.com/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "gpt-5.4", stream: "yes" }),
    }));
    expect(invalid).toBeInstanceOf(Response);
    expect((invalid as Response).status).toBe(400);

    const oversized = await readRelayRequest(new Request("https://api.clovapi.com/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": String(MAX_REQUEST_BYTES + 1) },
      body: "{}",
    }));
    expect(oversized).toBeInstanceOf(Response);
    expect((oversized as Response).status).toBe(413);
  });

  it("rejects chunked and falsely under-declared oversized bodies", async () => {
    const prefix = new TextEncoder().encode('{"model":"gpt-5.4","padding":"');
    const oversized = new Uint8Array(MAX_REQUEST_BYTES - prefix.byteLength + 1);

    const chunked = streamedRelayRequest([prefix, oversized]);
    await expectRelayError(await readRelayRequest(chunked.request), 413, "request_too_large");
    expect(chunked.wasCancelled()).toBe(true);

    const underDeclared = streamedRelayRequest([prefix, oversized], "1");
    await expectRelayError(await readRelayRequest(underDeclared.request), 413, "request_too_large");
    expect(underDeclared.wasCancelled()).toBe(true);
  });

  it("maps malformed Content-Length to invalid_request", async () => {
    for (const contentLength of ["", "-1", "+1", "1.0", "1e0", "1, 2", "NaN"]) {
      const result = await readRelayRequest(new Request("https://api.clovapi.com/v1/responses", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": contentLength },
        body: '{"model":"gpt-5.4"}',
      }));
      await expectRelayError(result, 400, "invalid_request");
    }
  });

  it("accepts a valid request exactly at the byte limit", async () => {
    const prefix = '{"model":"gpt-5.4","padding":"';
    const suffix = '"}';
    const raw = `${prefix}${"a".repeat(MAX_REQUEST_BYTES - prefix.length - suffix.length)}${suffix}`;
    expect(new TextEncoder().encode(raw)).toHaveLength(MAX_REQUEST_BYTES);

    const result = await readRelayRequest(new Request("https://api.clovapi.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": String(MAX_REQUEST_BYTES),
      },
      body: raw,
    }));
    expect(result).not.toBeInstanceOf(Response);
    if (result instanceof Response) return;
    expect(result.raw).toHaveLength(MAX_REQUEST_BYTES);
    expect(result.body.model).toBe("gpt-5.4");
  });

  it("keeps the legacy relay_error envelope", async () => {
    const response = relayError("no_node_capacity", 503);
    expect(await response.json()).toEqual({
      error: { type: "relay_error", code: "no_node_capacity", message: "no node capacity" },
    });
  });

  it("only permits node fallback for an explicit rejected admission", () => {
    expect(isAdmissionRejected(relayError("node_unavailable", 409, {
      "X-Clovapi-Relay-Admission": "rejected",
    }))).toBe(true);
    expect(isAdmissionRejected(relayError("node_unavailable", 502, {
      "X-Clovapi-Relay-Admission": "accepted",
    }))).toBe(false);
  });

  it("orders credential generations so delayed disconnects cannot kill the current socket", () => {
    expect(compareAuthGeneration(7, 6)).toBe("older");
    expect(compareAuthGeneration(7, 7)).toBe("current");
    expect(compareAuthGeneration(7, 8)).toBe("newer");
    expect(compareAuthGeneration(7, undefined)).toBe("invalid");
    expect(compareAuthGeneration(7, -1)).toBe("invalid");
    expect(compareAuthGeneration(7, 7.5)).toBe("invalid");
  });

  it("never regresses in-memory usage from a stale projection read", () => {
    const today = "2026-09-20";
    expect(mergeUsageSnapshot(today, 8, today, 7, today)).toEqual({ usageDay: today, used: 8 });
    expect(mergeUsageSnapshot(today, 8, "2026-09-19", 99, today)).toEqual({ usageDay: today, used: 8 });
    expect(mergeUsageSnapshot("2026-09-19", 99, today, 2, today)).toEqual({ usageDay: today, used: 2 });
    expect(mergeUsageSnapshot("2026-09-19", 99, "2026-09-19", 99, today)).toEqual({ usageDay: today, used: 0 });
  });
});
