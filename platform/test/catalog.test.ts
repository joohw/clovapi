import { afterEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../src/env";
import { catalogSnapshot, publicCatalog } from "../src/relay/catalog";

function fixture(): { env: Env; context: ExecutionContext; pending: Promise<unknown>[]; queries: () => number } {
  let queryCount = 0;
  const database = {
    prepare(sql: string) {
      queryCount++;
      const statement = {
        bind() {
          return statement;
        },
        async all() {
          if (sql.includes("date(bucket_start")) {
            return { results: [{ id: "model-a", day: "2026-09-20", requests: 2 }] };
          }
          if (sql.includes("SUM(CASE")) {
            return { results: [{ id: "model-a", requests_24h: 2, requests_7d: 4 }] };
          }
          return { results: [{ id: "model-a", available_nodes: 1 }] };
        },
        async first() {
          if (sql.includes("model_usage_coverage")) return { history_since: Date.UTC(2026, 8, 1) };
          return { count: 1 };
        },
      };
      return statement;
    },
  } as unknown as D1Database;
  const pending: Promise<unknown>[] = [];
  const context = {
    waitUntil(promise: Promise<unknown>) {
      pending.push(promise);
    },
  } as unknown as ExecutionContext;
  return {
    env: { DB: database } as unknown as Env,
    context,
    pending,
    queries: () => queryCount,
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("model catalog edge cache", () => {
  it("shares one canonical cached snapshot across callers", async () => {
    let stored: Response | undefined;
    vi.stubGlobal("caches", {
      default: {
        async match() {
          return stored?.clone();
        },
        async put(_key: Request, response: Response) {
          stored = response.clone();
        },
      },
    });
    const { env, context, pending, queries } = fixture();

    const first = await catalogSnapshot(env, context);
    await Promise.all(pending);
    const second = await catalogSnapshot(env, context);

    expect(first.models[0]).toMatchObject({ id: "model-a", availableNodes: 1 });
    expect(second).toEqual(first);
    expect(queries()).toBe(5);
  });

  it("returns a short-lived public cache policy", async () => {
    vi.stubGlobal("caches", {
      default: { match: async () => undefined, put: async () => undefined },
    });
    const { env, context } = fixture();
    const response = await publicCatalog(new Request("https://api.clovapi.com/api/models"), env, context);

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toContain("s-maxage=60");
  });
});
