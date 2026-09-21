import { describe, expect, it } from "vitest";
import { applyPlatformAction } from "../src/control/platform";
import type { Env } from "../src/env";

interface CapturedStatement {
  sql: string;
  values: unknown[];
  bind: (...values: unknown[]) => CapturedStatement;
  run: () => Promise<D1Result>;
}

function result(changes: number, rows: unknown[] = []): D1Result {
  return {
    success: true,
    meta: { changes },
    results: rows,
  } as unknown as D1Result;
}

function testHarness(): {
  env: Env;
  context: ExecutionContext;
  batches: CapturedStatement[][];
} {
  const batches: CapturedStatement[][] = [];
  const database = {
    prepare(sql: string): CapturedStatement {
      const statement: CapturedStatement = {
        sql,
        values: [],
        bind(...values: unknown[]) {
          statement.values = values;
          return statement;
        },
        async run() {
          return result(1);
        },
      };
      return statement;
    },
    async batch(statements: CapturedStatement[]) {
      batches.push(statements);
      // The actor does not own the target key or node. D1 still executes every
      // statement in a batch, so the audit UPDATE must carry its own guard.
      return [result(0), result(0)];
    },
  };
  return {
    env: { DB: database } as unknown as Env,
    context: { waitUntil() {} } as unknown as ExecutionContext,
    batches,
  };
}

describe("platform action ownership guards", () => {
  it("cannot cancel another tenant's relay audit by guessing an API key id", async () => {
    const { env, context, batches } = testHarness();
    const userId = "user-a";
    const foreignKeyId = "00000000-0000-4000-8000-000000000001";

    await expect(applyPlatformAction(env, context, userId, {
      action: "revoke_key",
      id: foreignKeyId,
    })).rejects.toMatchObject({ code: "not_found" });

    const auditUpdate = batches[0]?.[1];
    expect(auditUpdate?.sql).toMatch(/EXISTS[\s\S]+FROM api_keys[\s\S]+api_keys\.user_id = \?/u);
    expect(auditUpdate?.values.slice(-2)).toEqual([foreignKeyId, userId]);
  });

  it("cannot cancel another tenant's relay audit by guessing a node id", async () => {
    const { env, context, batches } = testHarness();
    const userId = "user-a";
    const foreignNodeId = "00000000-0000-4000-8000-000000000002";

    await expect(applyPlatformAction(env, context, userId, {
      action: "revoke_node_key",
      id: foreignNodeId,
    })).rejects.toMatchObject({ code: "not_found" });

    const auditUpdate = batches[0]?.[1];
    expect(auditUpdate?.sql).toMatch(/EXISTS[\s\S]+FROM nodes[\s\S]+nodes\.user_id = \?/u);
    expect(auditUpdate?.values.slice(-2)).toEqual([foreignNodeId, userId]);
  });
});
