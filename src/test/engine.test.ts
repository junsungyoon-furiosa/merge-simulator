import { describe, expect, test } from "vitest";
import { runSimulation } from "../sim/engine";
import { DEFAULT_SCENARIO, type ScenarioConfig } from "../sim/model";

const scenario = (changes: Partial<ScenarioConfig> = {}): ScenarioConfig => ({
  ...DEFAULT_SCENARIO,
  prCount: 100,
  targetMergeCount: 80,
  repetitions: 10,
  arrival: { kind: "fixed", value: 1 },
  ci: { ...DEFAULT_SCENARIO.ci, duration: { kind: "fixed", value: 2 }, falseNegativeRate: 0, falsePositiveRate: 0 },
  interactionDefects: { ...DEFAULT_SCENARIO.interactionDefects, setsPerHundredPrs: 0 },
  ...changes,
});

describe("simulation engine", () => {
  test("is fully deterministic", () => {
    const config = scenario();
    expect(runSimulation(config, { kind: "batchSplit", batchSize: 8, maxWait: 3, splitRatio: 0.5 }, 0))
      .toEqual(runSimulation(config, { kind: "batchSplit", batchSize: 8, maxWait: 3, splitRatio: 0.5 }, 0));
  });

  test("healthy PRs merge and CI never overlaps", () => {
    const result = runSimulation(scenario({ individualDefectProbability: 0 }), { kind: "sequential" }, 0);
    expect(result.metrics.endReason).toBe("targetReached");
    expect(result.metrics.mergedPrs).toBe(80);
    expect(result.metrics.defectIngressRate).toBe(0);
    expect(result.metrics.ciUtilization).toBeLessThanOrEqual(1);
  });

  test("single failing PR is quarantined", () => {
    const result = runSimulation(scenario({ individualDefectProbability: 1, targetMergeCount: 10 }), { kind: "sequential" }, 0);
    expect(result.metrics.mergedPrs).toBe(0);
    expect(result.metrics.quarantinedPrs).toBe(100);
    expect(result.metrics.endReason).toBe("exhausted");
  });

  test("false negatives allow a defective master", () => {
    const config = scenario({ individualDefectProbability: 1, targetMergeCount: 20, ci: { ...DEFAULT_SCENARIO.ci, duration: { kind: "fixed", value: 1 }, falseNegativeRate: 1, falsePositiveRate: 0 } });
    const result = runSimulation(config, { kind: "batchSplit", batchSize: 5, maxWait: 2, splitRatio: 0.5 }, 0);
    expect(result.metrics.mergedDefectivePrs).toBeGreaterThan(0);
    expect(result.metrics.masterBecameUnhealthy).toBe(1);
  });

  test("LLM never directly quarantines a PR", () => {
    const result = runSimulation(scenario({ individualDefectProbability: 0.2 }), { kind: "llmAssisted", batchSize: 8, maxWait: 3 }, 0);
    const quarantines = result.events.filter((event) => event.type === "prStateChanged" && event.to === "quarantined");
    for (const event of quarantines) {
      const previous = result.events.slice(0, event.seq).reverse().find((candidate) => candidate.type === "ciCompleted" && candidate.prIds?.includes(event.prIds![0]));
      expect(previous?.prIds).toHaveLength(1);
      expect(previous?.data?.observedSuccess).toBe(false);
    }
  });
});
