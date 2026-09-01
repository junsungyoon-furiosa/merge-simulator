import { describe, expect, test } from "vitest";
import { runSimulation } from "../sim/engine";
import { DEFAULT_SCENARIO, type PolicyConfig, type PolicyInstance, type ScenarioConfig } from "../sim/model";

const scenario = (changes: Partial<ScenarioConfig> = {}): ScenarioConfig => ({
  ...DEFAULT_SCENARIO,
  prCount: 100,
  targetMergeCount: 80,
  repetitions: 10,
  arrival: { kind: "fixed", value: 1 },
  ci: { ...DEFAULT_SCENARIO.ci, failureDuration: { lower: 2, upper: 2, coverage: 0.95 }, successDuration: { lower: 2, upper: 2, coverage: 0.95 }, falseNegativeRate: 0, falsePositiveRate: 0 },
  interactionDefects: { ...DEFAULT_SCENARIO.interactionDefects, setsPerHundredPrs: 0 },
  ...changes,
});

const instance = (config: PolicyConfig, id = `test-${config.kind}`): PolicyInstance => ({ id, config });

describe("simulation engine", () => {
  test("is fully deterministic", () => {
    const config = scenario();
    const policy = instance({ kind: "batchSplit", batchSize: 8, maxWait: 3, splitRatio: 0.5 });
    expect(runSimulation(config, policy, 0)).toEqual(runSimulation(config, policy, 0));
  });

  test("healthy PRs merge and CI never overlaps", () => {
    const result = runSimulation(scenario({ individualDefectProbability: 0 }), instance({ kind: "sequential" }), 0);
    expect(result.metrics.endReason).toBe("targetReached");
    expect(result.metrics.mergedPrs).toBe(80);
    expect(result.metrics.defectIngressRate).toBe(0);
    expect(result.metrics.ciUtilization).toBeLessThanOrEqual(1);
  });

  test("single failing PR is quarantined", () => {
    const result = runSimulation(scenario({ individualDefectProbability: 1, targetMergeCount: 10 }), instance({ kind: "sequential" }), 0);
    expect(result.metrics.mergedPrs).toBe(0);
    expect(result.metrics.quarantinedPrs).toBe(100);
    expect(result.metrics.endReason).toBe("exhausted");
  });

  test("false negatives allow a defective master", () => {
    const config = scenario({ individualDefectProbability: 1, targetMergeCount: 20, ci: { ...DEFAULT_SCENARIO.ci, failureDuration: { lower: 1, upper: 1, coverage: 0.95 }, successDuration: { lower: 1, upper: 1, coverage: 0.95 }, falseNegativeRate: 1, falsePositiveRate: 0 } });
    const result = runSimulation(config, instance({ kind: "batchSplit", batchSize: 5, maxWait: 2, splitRatio: 0.5 }), 0);
    expect(result.metrics.mergedDefectivePrs).toBeGreaterThan(0);
    expect(result.metrics.masterBecameUnhealthy).toBe(1);
  });

  test("selects CI duration by the observed result", () => {
    const durations = {
      failureDuration: { lower: 2, upper: 2, coverage: 0.95 },
      successDuration: { lower: 9, upper: 9, coverage: 0.95 },
    };
    const success = runSimulation(scenario({ individualDefectProbability: 0, ci: { ...DEFAULT_SCENARIO.ci, ...durations, falseNegativeRate: 0, falsePositiveRate: 0 } }), instance({ kind: "sequential" }), 0);
    const failure = runSimulation(scenario({ individualDefectProbability: 1, targetMergeCount: 10, ci: { ...DEFAULT_SCENARIO.ci, ...durations, falseNegativeRate: 0, falsePositiveRate: 0 } }), instance({ kind: "sequential" }), 0);
    expect(success.events.filter((event) => event.type === "ciStarted").every((event) => event.data?.duration === 9)).toBe(true);
    expect(failure.events.filter((event) => event.type === "ciStarted").every((event) => event.data?.duration === 2)).toBe(true);
  });

  test("LLM never directly quarantines a PR", () => {
    const result = runSimulation(scenario({ individualDefectProbability: 0.2 }), instance({ kind: "llmAssisted", batchSize: 8, maxWait: 3 }), 0);
    const quarantines = result.events.filter((event) => event.type === "prStateChanged" && event.to === "quarantined");
    for (const event of quarantines) {
      const previous = result.events.slice(0, event.seq).reverse().find((candidate) => candidate.type === "ciCompleted" && candidate.prIds?.includes(event.prIds![0]));
      expect(previous?.prIds).toHaveLength(1);
      expect(previous?.data?.observedSuccess).toBe(false);
    }
  });
});
