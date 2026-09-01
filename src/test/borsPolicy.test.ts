import { describe, expect, test } from "vitest";
import type { PolicyAction } from "../sim/policies";
import { createBorsPolicy } from "../sim/policies";

const config = {
  kind: "bors" as const,
  maxBatchSize: 2,
  batchDelay: 10,
  splitBatchScheduling: "fifo" as const,
};

function submitIds(actions: PolicyAction[]): string[] | undefined {
  return actions.find((action) => action.type === "submitCi")?.prIds;
}

describe("bors policy", () => {
  test("treats max batch size as a cap and keeps the first-arrival delay", () => {
    const policy = createBorsPolicy(config);
    policy.onArrival("pr-1", 0);
    policy.onArrival("pr-2", 1);

    expect(policy.decide({ now: 1, ciIdle: true, allArrived: false })).toEqual([
      { type: "waitUntil", time: 10 },
    ]);

    policy.onArrival("pr-3", 9);
    expect(submitIds(policy.decide({ now: 10, ciIdle: true, allArrived: false }))).toEqual(["pr-1", "pr-2"]);
    expect(policy.decide({ now: 10, ciIdle: true, allArrived: false })).toEqual([
      { type: "waitUntil", time: 19 },
    ]);
  });

  test("flushes a final partial batch when all arrivals are complete", () => {
    const policy = createBorsPolicy(config);
    policy.onArrival("pr-1", 0);
    expect(submitIds(policy.decide({ now: 0, ciIdle: true, allArrived: true }))).toEqual(["pr-1"]);
  });

  test("uses common batch FIFO by default", () => {
    const policy = createBorsPolicy({ ...config, batchDelay: 0 });
    policy.onArrival("pr-1", 0);
    policy.onArrival("pr-2", 0);
    expect(submitIds(policy.decide({ now: 0, ciIdle: true, allArrived: false }))).toEqual(["pr-1", "pr-2"]);

    policy.onArrival("fresh-1", 1);
    policy.onArrival("fresh-2", 1);
    policy.onBatchFailed("batch-1", ["pr-1", "pr-2"], false);

    expect(submitIds(policy.decide({ now: 2, ciIdle: true, allArrived: false }))).toEqual(["fresh-1", "fresh-2"]);
    expect(submitIds(policy.decide({ now: 2, ciIdle: true, allArrived: false }))).toEqual(["pr-1"]);
    expect(submitIds(policy.decide({ now: 2, ciIdle: true, allArrived: false }))).toEqual(["pr-2"]);
  });

  test("can schedule split batches before fresh batches", () => {
    const policy = createBorsPolicy({ ...config, batchDelay: 0, splitBatchScheduling: "beforeFresh" });
    policy.onArrival("pr-1", 0);
    policy.onArrival("pr-2", 0);
    policy.decide({ now: 0, ciIdle: true, allArrived: false });

    policy.onArrival("fresh-1", 1);
    policy.onArrival("fresh-2", 1);
    policy.onBatchFailed("batch-1", ["pr-1", "pr-2"], false);

    expect(submitIds(policy.decide({ now: 2, ciIdle: true, allArrived: false }))).toEqual(["pr-1"]);
  });

  test("splits odd failed batches deterministically and reapplies the batch delay", () => {
    const policy = createBorsPolicy({ ...config, maxBatchSize: 5, splitBatchScheduling: "beforeFresh" });
    policy.onBatchFailed("batch-1", ["a", "b", "c", "d", "e"], false);

    expect(policy.decide({ now: 5, ciIdle: true, allArrived: true })).toEqual([
      { type: "waitUntil", time: 15 },
    ]);
    expect(submitIds(policy.decide({ now: 15, ciIdle: true, allArrived: false }))).toEqual(["a", "b", "c"]);
    expect(submitIds(policy.decide({ now: 15, ciIdle: true, allArrived: false }))).toEqual(["d", "e"]);
  });
});
