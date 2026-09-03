import { expect, test } from "vitest";
import { runExperiment } from "../sim/experiment";
import { DEFAULT_SCENARIO, type PolicyInstance } from "../sim/model";
import { DEFAULT_POLICIES } from "../sim/policyRegistry";
import { fromJson, resultToCsv, toJson } from "../storage/export";
import { normalizePolicyInstances, policyInstancesSchema, scenarioSchema } from "../storage/schema";

test("accepts only policy instances and rejects duplicate ids", () => {
  expect(normalizePolicyInstances(DEFAULT_POLICIES)).toEqual(DEFAULT_POLICIES);
  expect(() => normalizePolicyInstances(DEFAULT_POLICIES.map((policy) => policy.config))).toThrow();
  expect(policyInstancesSchema.safeParse([
    { id: "duplicate", config: { kind: "sequential" } },
    { id: "duplicate", config: { kind: "sequential" } },
  ]).success).toBe(false);
});

test("round-trips schema v1 with the daily arrival profile and calibration sources", () => {
  const scenario = {
    ...DEFAULT_SCENARIO,
    calibration: { parameters: {
      dailyPrCount: { profileId: "bors-production-2026-q2", profileVersion: 1, appliedValue: 120 },
      ciFailureDuration: { profileId: "bors-production-2026-q2", profileVersion: 1, appliedValue: { lower: 8, upper: 35, coverage: 0.95 } },
    } },
  };
  const json = toJson(scenario, DEFAULT_POLICIES);
  expect(JSON.parse(json).schemaVersion).toBe(1);
  const imported = fromJson(json);
  expect(imported.scenario).toEqual(scenario);
  expect(imported.scenario.arrival.hourlyWeights).toEqual(DEFAULT_SCENARIO.arrival.hourlyWeights);
  expect(imported.policies).toEqual(DEFAULT_POLICIES);
});

test("rejects pre-release schemas and old arrival distributions", () => {
  expect(() => fromJson(JSON.stringify({ schemaVersion: 3, scenario: { ...DEFAULT_SCENARIO, schemaVersion: 3 }, policies: DEFAULT_POLICIES }))).toThrow();
  expect(scenarioSchema.safeParse({ ...DEFAULT_SCENARIO, arrival: { kind: "exponential", mean: 10 } }).success).toBe(false);
});

test("validates all 24 hourly weights", () => {
  expect(scenarioSchema.safeParse({ ...DEFAULT_SCENARIO, arrival: { ...DEFAULT_SCENARIO.arrival, hourlyWeights: Array(23).fill(1) } }).success).toBe(false);
  expect(scenarioSchema.safeParse({ ...DEFAULT_SCENARIO, arrival: { ...DEFAULT_SCENARIO.arrival, hourlyWeights: Array(24).fill(0) } }).success).toBe(false);
});

test("validates empirical CI duration observations", () => {
  expect(scenarioSchema.safeParse({ ...DEFAULT_SCENARIO, ci: { ...DEFAULT_SCENARIO.ci, failureDuration: { kind: "empirical", observations: [] } } }).success).toBe(false);
  expect(scenarioSchema.safeParse({ ...DEFAULT_SCENARIO, ci: { ...DEFAULT_SCENARIO.ci, failureDuration: { kind: "empirical", observations: [[10, 0]] } } }).success).toBe(false);
  expect(scenarioSchema.safeParse({ ...DEFAULT_SCENARIO, ci: { ...DEFAULT_SCENARIO.ci, failureDuration: { lower: 10, upper: 40, coverage: 0.95 } } }).success).toBe(true);
});

test("rejects unknown calibration parameter ids", () => {
  const scenario = { ...DEFAULT_SCENARIO, calibration: { parameters: { unknownParameter: { profileId: "x", profileVersion: 1, appliedValue: 1 } } } };
  expect(() => fromJson(JSON.stringify({ schemaVersion: 1, scenario, policies: DEFAULT_POLICIES }))).toThrow();
});

test("JSON preserves bors scheduling settings", () => {
  const policies: PolicyInstance[] = [{
    id: "bors-fifo",
    config: { kind: "bors", maxBatchSize: 12, batchDelay: 20, splitBatchScheduling: "fifo" },
  }];
  expect(fromJson(toJson(DEFAULT_SCENARIO, policies)).policies).toEqual(policies);
});

test("CSV distinguishes same-kind policy instances and includes their configs", () => {
  const policies = [
    { id: "batch-small", config: { kind: "batchSplit" as const, batchSize: 4, maxWait: 10, splitRatio: 0.5 } },
    { id: "batch-large", config: { kind: "batchSplit" as const, batchSize: 16, maxWait: 10, splitRatio: 0.5 } },
  ];
  const result = runExperiment({ ...DEFAULT_SCENARIO, prCount: 20, targetMergeCount: 10, repetitions: 1 }, policies);
  const csv = resultToCsv(result);
  expect(csv).toContain("policyId,policyKind,policyLabel,policyConfig");
  expect(csv).toContain("batch-small");
  expect(csv).toContain("batch-large");
  expect(csv).toContain("batchSize");
});

test("round-trips a current experiment result", () => {
  const resultScenario = { ...DEFAULT_SCENARIO, prCount: 100, targetMergeCount: 10, repetitions: 10 };
  const result = runExperiment(resultScenario, DEFAULT_POLICIES);
  const imported = fromJson(toJson(DEFAULT_SCENARIO, DEFAULT_POLICIES, result));
  expect(imported.result?.scenario).toEqual(resultScenario);
  expect(imported.result?.policies).toEqual(DEFAULT_POLICIES);
  expect(imported.result?.results.map((item) => item.policy.id)).toEqual(DEFAULT_POLICIES.map((policy) => policy.id));
});
