import { describe, expect, test } from "vitest";
import type { PolicyAction } from "../sim/policies";
import { createBatchSplitPolicy, createBorsPolicy, createLlmAssistedPolicy } from "../sim/policies";

const config = {
  kind: "bors" as const,
  maxBatchSize: 2,
  splitRatio: 0.5,
  splitBatchScheduling: "fifo" as const,
  batchTiming: { mode: "fixedDelay" as const, minutes: 10 },
  splitBatchDelayMinutes: 10,
  failureRecovery: { mode: "splitOnly" as const },
};

function submitIds(actions: PolicyAction[]): string[] | undefined {
  return actions.find((action) => action.type === "submitCi")?.prIds;
}

describe("configurable batch policy and Bors preset", () => {
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
    const policy = createBorsPolicy({ ...config, batchTiming: { ...config.batchTiming, minutes: 0 }, splitBatchDelayMinutes: 0 });
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
    const policy = createBorsPolicy({ ...config, batchTiming: { ...config.batchTiming, minutes: 0 }, splitBatchDelayMinutes: 0, splitBatchScheduling: "beforeFresh" });
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

  test("uses the configured split ratio", () => {
    const policy = createBatchSplitPolicy({ ...config, kind: "batchSplit", splitRatio: 0.4, splitBatchScheduling: "beforeFresh", splitBatchDelayMinutes: 0 });
    policy.onBatchFailed("batch-1", ["a", "b", "c", "d", "e"], false);
    expect(submitIds(policy.decide({ now: 0, ciIdle: true, allArrived: false }))).toEqual(["a", "b"]);
    expect(submitIds(policy.decide({ now: 0, ciIdle: true, allArrived: false }))).toEqual(["c", "d", "e"]);
  });

  test("starts a size-or-timeout batch as soon as it reaches the size cap", () => {
    const policy = createBatchSplitPolicy({ ...config, kind: "batchSplit", batchTiming: { mode: "sizeOrTimeout", minutes: 10 }, splitBatchDelayMinutes: 0 });
    policy.onArrival("pr-1", 0);
    policy.onArrival("pr-2", 1);
    expect(submitIds(policy.decide({ now: 1, ciIdle: true, allArrived: false }))).toEqual(["pr-1", "pr-2"]);
  });

  test("uses LLM selection as a configurable failure recovery strategy", () => {
    const policy = createBatchSplitPolicy({ ...config, kind: "batchSplit", batchTiming: { mode: "sizeOrTimeout", minutes: 0 }, splitBatchDelayMinutes: 0, splitBatchScheduling: "beforeFresh", failureRecovery: { mode: "llmThenSplit" } });
    policy.onArrival("healthy", 0);
    policy.onArrival("suspect", 0);
    expect(policy.decide({ now: 0, ciIdle: true, allArrived: false })).toEqual([
      { type: "submitCi", prIds: ["healthy", "suspect"], allowLlm: true },
    ]);

    policy.onBatchFailed("failed", ["healthy", "suspect"], true);
    expect(policy.decide({ now: 1, ciIdle: true, allArrived: false })).toEqual([
      { type: "callLlm", failedBatchId: "failed" },
    ]);

    policy.onLlmCompleted("failed", ["healthy", "suspect"], ["suspect"]);
    expect(policy.decide({ now: 2, ciIdle: true, allArrived: false })).toEqual([
      { type: "submitCi", prIds: ["healthy"], allowLlm: false },
    ]);
    expect(policy.decide({ now: 2, ciIdle: true, allArrived: false })).toEqual([
      { type: "submitCi", prIds: ["suspect"], allowLlm: false },
    ]);
  });

  test("uses the same engine behavior for equal generic and LLM preset settings", () => {
    const generic = createBatchSplitPolicy({ ...config, kind: "batchSplit", failureRecovery: { mode: "llmThenSplit" } });
    const preset = createLlmAssistedPolicy({ ...config, kind: "llmAssisted", failureRecovery: { mode: "llmThenSplit" } });
    for (const policy of [generic, preset]) {
      policy.onArrival("pr-1", 0);
      policy.onArrival("pr-2", 1);
    }
    expect(generic.decide({ now: 10, ciIdle: true, allArrived: false })).toEqual(preset.decide({ now: 10, ciIdle: true, allArrived: false }));
  });

  test("uses the same engine behavior for equal generic and Bors preset settings", () => {
    const bors = createBorsPolicy(config);
    const generic = createBatchSplitPolicy({ ...config, kind: "batchSplit" });
    for (const policy of [bors, generic]) {
      policy.onArrival("pr-1", 0);
      policy.onArrival("pr-2", 1);
      policy.onBatchFailed("failed", ["a", "b"], false);
    }
    expect(generic.decide({ now: 1, ciIdle: true, allArrived: false })).toEqual(bors.decide({ now: 1, ciIdle: true, allArrived: false }));
    expect(generic.decide({ now: 10, ciIdle: true, allArrived: false })).toEqual(bors.decide({ now: 10, ciIdle: true, allArrived: false }));
  });
});
