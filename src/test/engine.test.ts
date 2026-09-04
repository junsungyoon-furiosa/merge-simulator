import { describe, expect, test } from "vitest";
import { runSimulation } from "../sim/engine";
import { DEFAULT_SCENARIO, type PolicyConfig, type PolicyInstance, type ScenarioConfig } from "../sim/model";

const scenario = (changes: Partial<ScenarioConfig> = {}): ScenarioConfig => ({
  ...DEFAULT_SCENARIO,
  prCount: 100,
  targetMergeCount: 80,
  repetitions: 10,
  arrival: { ...DEFAULT_SCENARIO.arrival, meanPerDay: 1440, hourlyWeights: Array(24).fill(1) },
  ci: { ...DEFAULT_SCENARIO.ci, failureDuration: { lower: 2, upper: 2, coverage: 0.95 }, successDuration: { lower: 2, upper: 2, coverage: 0.95 }, falseNegativeRate: 0, falsePositiveRate: 0 },
  interactionDefects: { ...DEFAULT_SCENARIO.interactionDefects, setsPerHundredPrs: 0 },
  ...changes,
});

const instance = (config: PolicyConfig, id = `test-${config.kind}`): PolicyInstance => ({ id, config });

describe("simulation engine", () => {
  test("is fully deterministic", () => {
    const config = scenario();
    const policy = instance({ kind: "batchSplit", maxBatchSize: 8, splitRatio: 0.5, splitBatchScheduling: "beforeFresh", batchTiming: { mode: "sizeOrTimeout", minutes: 3 }, splitBatchDelayMinutes: 0, failureRecovery: { mode: "splitOnly" } });
    expect(runSimulation(config, policy, 0)).toEqual(runSimulation(config, policy, 0));
  });

  test("calibration metadata does not change events or metrics", () => {
    const config = scenario();
    const calibrated = { ...config, calibration: { parameters: { dailyPrCount: { profileId: "test", profileVersion: 1, appliedValue: 1 } } } };
    const policy = instance({ kind: "batchSplit", maxBatchSize: 8, splitRatio: 0.5, splitBatchScheduling: "beforeFresh", batchTiming: { mode: "sizeOrTimeout", minutes: 3 }, splitBatchDelayMinutes: 0, failureRecovery: { mode: "splitOnly" } });
    expect(runSimulation(calibrated, policy, 0)).toEqual(runSimulation(config, policy, 0));
  });

  test("healthy PRs merge and CI never overlaps", () => {
    const result = runSimulation(scenario({ individualDefectProbability: 0 }), instance({ kind: "sequential" }), 0);
    expect(result.metrics.endReason).toBe("targetReached");
    expect(result.metrics.mergedPrs).toBe(80);
    expect(result.metrics.defectIngressRate).toBe(0);
    expect(result.metrics.ciUtilization).toBeLessThanOrEqual(1);
    expect(result.metrics.resolutionTime.count).toBe(80);
    expect(result.metrics.averageCiRunsPerResolvedPr).toBe(1);
    expect(result.metrics.averageBatchSize).toBe(1);
    expect(result.metrics.averageSuccessfulBatchSize).toBe(1);
    expect(result.metrics.averageFailedBatchSize).toBeNull();
    expect(result.metrics.singletonCiRunRate).toBe(1);
    expect(result.metrics.mergedPrsPerCiRun).toBe(1);
  });

  test("single failing PR is quarantined", () => {
    const result = runSimulation(scenario({ individualDefectProbability: 1, targetMergeCount: 10 }), instance({ kind: "sequential" }), 0);
    expect(result.metrics.mergedPrs).toBe(0);
    expect(result.metrics.quarantinedPrs).toBe(100);
    expect(result.metrics.endReason).toBe("exhausted");
  });

  test("false negatives allow a defective master", () => {
    const config = scenario({ individualDefectProbability: 1, targetMergeCount: 20, ci: { ...DEFAULT_SCENARIO.ci, failureDuration: { lower: 1, upper: 1, coverage: 0.95 }, successDuration: { lower: 1, upper: 1, coverage: 0.95 }, falseNegativeRate: 1, falsePositiveRate: 0 } });
    const result = runSimulation(config, instance({ kind: "batchSplit", maxBatchSize: 5, splitRatio: 0.5, splitBatchScheduling: "beforeFresh", batchTiming: { mode: "sizeOrTimeout", minutes: 2 }, splitBatchDelayMinutes: 0, failureRecovery: { mode: "splitOnly" } }), 0);
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

  test("measures CI visits until each PR is merged or quarantined", () => {
    const result = runSimulation(scenario({ individualDefectProbability: 1, targetMergeCount: 10 }), instance({ kind: "batchSplit", maxBatchSize: 8, splitRatio: 0.5, splitBatchScheduling: "beforeFresh", batchTiming: { mode: "sizeOrTimeout", minutes: 3 }, splitBatchDelayMinutes: 0, failureRecovery: { mode: "splitOnly" } }), 0);
    const ciParticipations = result.events
      .filter((event) => event.type === "ciStarted")
      .reduce((sum, event) => sum + (event.prIds?.length ?? 0), 0);
    expect(result.metrics.resolutionTime.count).toBe(100);
    expect(result.metrics.resolutionTime.mean).toBeGreaterThan(0);
    expect(result.metrics.averageCiRunsPerResolvedPr).toBeCloseTo(ciParticipations / 100);
    expect(result.metrics.averageCiRunsPerResolvedPr).toBeGreaterThan(1);
    const startedBatches = result.events.filter((event) => event.type === "ciStarted");
    const expectedAverageBatchSize = startedBatches.reduce((sum, event) => sum + (event.prIds?.length ?? 0), 0) / startedBatches.length;
    expect(result.metrics.averageBatchSize).toBeCloseTo(expectedAverageBatchSize);
    expect(result.metrics.averageSuccessfulBatchSize).toBeNull();
    const failedBatches = result.events.filter((event) => event.type === "ciCompleted" && event.data?.observedSuccess === false);
    const expectedAverageFailedBatchSize = failedBatches.reduce((sum, event) => sum + (event.prIds?.length ?? 0), 0) / failedBatches.length;
    expect(result.metrics.averageFailedBatchSize).toBeCloseTo(expectedAverageFailedBatchSize);
    expect(result.metrics.singletonCiRunRate).toBeCloseTo(startedBatches.filter((event) => event.prIds?.length === 1).length / startedBatches.length);
    expect(result.metrics.mergedPrsPerCiRun).toBe(0);
  });

  test("separates LLM non-suspects from suspects and rechecks both through CI", () => {
    const policy = instance({ kind: "llmAssisted", maxBatchSize: 8, splitRatio: 0.5, splitBatchScheduling: "beforeFresh", batchTiming: { mode: "sizeOrTimeout", minutes: 3 }, splitBatchDelayMinutes: 0, failureRecovery: { mode: "llmThenSplit" } });
    const llmScenario = (culpritHitRate: number) => scenario({
      individualDefectProbability: 1,
      targetMergeCount: 10,
      llm: { ...DEFAULT_SCENARIO.llm, duration: { lower: 1, upper: 1, coverage: 0.95 }, culpritHitRate, innocentFalseAccusationRate: 0 },
    });

    const noSuspects = runSimulation(llmScenario(0), policy, 0);
    const notSuspectedEvents = noSuspects.events.filter((event) => event.type === "prStateChanged" && event.to === "notSuspected");
    expect(notSuspectedEvents.length).toBeGreaterThan(0);
    expect(noSuspects.events.some((event) => event.type === "prStateChanged" && event.to === "suspected")).toBe(false);
    const firstNotSuspected = notSuspectedEvents[0];
    expect(noSuspects.events.slice(firstNotSuspected.seq + 1).some((event) => event.type === "ciStarted" && event.prIds?.includes(firstNotSuspected.prIds![0]))).toBe(true);
    expect(noSuspects.metrics.endReason).not.toBe("policyError");

    const allSuspects = runSimulation(llmScenario(1), policy, 0);
    expect(allSuspects.events.some((event) => event.type === "prStateChanged" && event.to === "suspected")).toBe(true);
    expect(allSuspects.events.some((event) => event.type === "prStateChanged" && event.to === "notSuspected")).toBe(false);
    expect(allSuspects.metrics.endReason).not.toBe("policyError");
  });

  test("LLM never directly quarantines a PR", () => {
    const result = runSimulation(scenario({ individualDefectProbability: 0.2 }), instance({ kind: "llmAssisted", maxBatchSize: 8, splitRatio: 0.5, splitBatchScheduling: "beforeFresh", batchTiming: { mode: "sizeOrTimeout", minutes: 3 }, splitBatchDelayMinutes: 0, failureRecovery: { mode: "llmThenSplit" } }), 0);
    const quarantines = result.events.filter((event) => event.type === "prStateChanged" && event.to === "quarantined");
    for (const event of quarantines) {
      const previous = result.events.slice(0, event.seq).reverse().find((candidate) => candidate.type === "ciCompleted" && candidate.prIds?.includes(event.prIds![0]));
      expect(previous?.prIds).toHaveLength(1);
      expect(previous?.data?.observedSuccess).toBe(false);
    }
  });
});
