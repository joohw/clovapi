import { describe, expect, it } from "vitest";
import { CancellationTombstones } from "../src/relay/cancellations";

describe("relay cancellation tombstones", () => {
  it("closes the cancel-before-bind-continuation race exactly once", async () => {
    const tombstones = new CancellationTombstones();
    let finishBind!: () => void;
    const bind = new Promise<void>((resolve) => { finishBind = resolve; });
    const dispatchContinuation = (async () => {
      await bind;
      return tombstones.take("request-1", 1_001);
    })();

    tombstones.remember("request-1", { code: "request_cancelled", expiresAt: 2_000 }, 1_000);
    finishBind();

    expect(await dispatchContinuation).toEqual({
      tombstone: { code: "request_cancelled", expiresAt: 2_000 },
      removed: ["request-1"],
    });
    expect(tombstones.take("request-1", 1_002)).toEqual({ tombstone: null, removed: [] });
  });

  it("does not revive expired cancellations after a restart", () => {
    const tombstones = new CancellationTombstones();
    tombstones.restore("expired", { code: "request_timeout", expiresAt: 999 });

    expect(tombstones.take("expired", 1_000)).toEqual({ tombstone: null, removed: ["expired"] });
  });

  it("does not delete a replacement for an expired tombstone with the same id", () => {
    const tombstones = new CancellationTombstones();
    tombstones.restore("request-1", { code: "request_timeout", expiresAt: 999 });

    expect(tombstones.remember(
      "request-1",
      { code: "request_cancelled", expiresAt: 2_000 },
      1_000,
    )).toEqual([]);
    expect(tombstones.take("request-1", 1_001).tombstone?.code).toBe("request_cancelled");
  });

  it("bounds restored and newly received tombstones", () => {
    const tombstones = new CancellationTombstones(2);
    tombstones.restore("oldest", { code: "request_cancelled", expiresAt: 2_000 });
    tombstones.restore("middle", { code: "request_cancelled", expiresAt: 3_000 });
    tombstones.restore("latest", { code: "request_cancelled", expiresAt: 4_000 });

    expect(tombstones.prune(1_000)).toEqual(["oldest"]);
    expect([...tombstones.entries()].map(([id]) => id)).toEqual(["middle", "latest"]);

    expect(tombstones.remember("new", { code: "request_timeout", expiresAt: 5_000 }, 1_001))
      .toEqual(["middle"]);
    expect([...tombstones.entries()].map(([id]) => id)).toEqual(["latest", "new"]);
  });
});
