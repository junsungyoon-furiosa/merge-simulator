import { describe, expect, test } from "vitest";
import { runSimulation } from "../sim/engine";
import { runExperiment } from "../sim/experiment";
import { DEFAULT_SCENARIO, type PolicyInstance, type ScenarioConfig } from "../sim/model";
import { createPolicy, POLICY_DEFINITIONS } from "../sim/policyRegistry";

const contractScenario: ScenarioConfig = {
  ...DEFAULT_SCENARIO,
  prCount: 60,
  targetMergeCount: 40,
  repetitions: 2,
  arrival: { ...DEFAULT_SCENARIO.arrival, meanPerDay: 1440, hourlyWeights: Array(24).fill(1) },
  individualDefectProbability: 0.15,
  interactionDefects: { ...DEFAULT_SCENARIO.interactionDefects, setsPerHundredPrs: 0 },
  ci: { ...DEFAULT_SCENARIO.ci, failureDuration: { lower: 2, upper: 2, coverage: 0.95 }, successDuration: { lower: 2, upper: 2, coverage: 0.95 }, falseNegativeRate: 0, falsePositiveRate: 0 },
  llm: { ...DEFAULT_SCENARIO.llm, duration: { lower: 1, upper: 1, coverage: 0.95 } },
};

describe.each(POLICY_DEFINITIONS)("$label policy contract", (definition) => {
  const policy: PolicyInstance = { id: `contract-${definition.kind}`, config: structuredClone(definition.defaultConfig) };

  test("is deterministic and does not end with a policy error", () => {
    const first = runSimulation(contractScenario, policy, 0);
    const second = runSimulation(contractScenario, policy, 0);
    expect(first).toEqual(second);
    expect(first.metrics.endReason).not.toBe("policyError");
  });

  test("respects the single CI resource and terminal transition rules", () => {
    const result = runSimulation(contractScenario, policy, 0);
    let ciRunning = false;
    for (const event of result.events) {
      if (event.type === "ciStarted") {
        expect(ciRunning).toBe(false);
        ciRunning = true;
      }
      if (event.type === "ciCompleted" || event.type === "ciInvalidated") {
        expect(ciRunning).toBe(true);
        ciRunning = false;
      }
      if (event.type === "prStateChanged" && event.to === "merged") {
        const completion = result.events.slice(0, event.seq).reverse().find((candidate) =>
          candidate.type === "ciCompleted" && candidate.prIds?.includes(event.prIds?.[0] ?? ""));
        expect(completion?.data?.observedSuccess).toBe(true);
      }
      if (event.type === "prStateChanged" && event.to === "quarantined") {
        const completion = result.events.slice(0, event.seq).reverse().find((candidate) =>
          candidate.type === "ciCompleted" && candidate.prIds?.includes(event.prIds?.[0] ?? ""));
        expect(completion?.data?.observedSuccess).toBe(false);
        expect(completion?.prIds).toHaveLength(1);
      }
    }
    expect(ciRunning).toBe(false);
  });
});

test("same config instances keep identical random outcomes regardless of id or order", () => {
  const first: PolicyInstance = { id: "batch-a", config: { kind: "batchSplit", batchSize: 8, maxWait: 30, splitRatio: 0.5 } };
  const second: PolicyInstance = { id: "batch-b", config: structuredClone(first.config) };
  const forward = runExperiment(contractScenario, [first, second]);
  const reverse = runExperiment(contractScenario, [second, first]);

  const metricsById = (result: typeof forward) => new Map(result.results.map((item) => [
    item.policy.id,
    item.runs.map((run) => ({ repetition: run.repetition, seed: run.seed, metrics: run.metrics })),
  ]));
  expect(metricsById(forward).get("batch-a")).toEqual(metricsById(forward).get("batch-b"));
  expect(metricsById(forward).get("batch-a")).toEqual(metricsById(reverse).get("batch-a"));
  expect(metricsById(forward).get("batch-b")).toEqual(metricsById(reverse).get("batch-b"));
});

test("unknown policy kinds fail explicitly", () => {
  expect(() => createPolicy({ kind: "unknown" } as never)).toThrow("Unknown policy kind: unknown");
});
