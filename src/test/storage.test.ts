import { expect, test } from "vitest";
import { runExperiment } from "../sim/experiment";
import { DEFAULT_SCENARIO, type PolicyConfig, type PolicyInstance } from "../sim/model";
import { DEFAULT_POLICIES } from "../sim/policyRegistry";
import { fromJson, resultToCsv, toJson } from "../storage/export";
import { normalizePolicyInstances, policyInstancesSchema } from "../storage/schema";

test("normalizes legacy policy configs with stable unique ids", () => {
  const legacy: PolicyConfig[] = [
    { kind: "sequential" },
    { kind: "batchSplit", batchSize: 4, maxWait: 10, splitRatio: 0.5 },
    { kind: "batchSplit", batchSize: 16, maxWait: 20, splitRatio: 0.25 },
  ];
  const first = normalizePolicyInstances(legacy);
  const second = normalizePolicyInstances(legacy);
  expect(first).toEqual(second);
  expect(new Set(first.map((policy) => policy.id)).size).toBe(legacy.length);
  expect(first.map((policy) => policy.config)).toEqual(legacy);
});

test("rejects duplicate policy instance ids", () => {
  expect(policyInstancesSchema.safeParse([
    { id: "duplicate", config: { kind: "sequential" } },
    { id: "duplicate", config: { kind: "sequential" } },
  ]).success).toBe(false);
});

test("JSON preserves current ids and imports the previous config-only shape", () => {
  const current = fromJson(toJson(DEFAULT_SCENARIO, DEFAULT_POLICIES));
  expect(current.policies).toEqual(DEFAULT_POLICIES);

  const legacyJson = JSON.stringify({
    schemaVersion: 1,
    scenario: DEFAULT_SCENARIO,
    policies: DEFAULT_POLICIES.map((policy) => policy.config),
  });
  const legacy = fromJson(legacyJson);
  expect(legacy.policies.map((policy) => policy.config)).toEqual(DEFAULT_POLICIES.map((policy) => policy.config));
  expect(new Set(legacy.policies.map((policy) => policy.id)).size).toBe(DEFAULT_POLICIES.length);
});

test("migrates schema v1 duration distributions to stored central intervals", () => {
  const legacyScenario = {
    ...DEFAULT_SCENARIO,
    schemaVersion: 1,
    ci: { duration: { kind: "uniform", min: 50, max: 70 }, falseNegativeRate: 0.01, falsePositiveRate: 0.01 },
    llm: { duration: { kind: "uniform", min: 1, max: 3 }, culpritHitRate: 0.7, innocentFalseAccusationRate: 0.1 },
  };
  const imported = fromJson(JSON.stringify({ schemaVersion: 1, scenario: legacyScenario, policies: DEFAULT_POLICIES }));
  expect(imported.scenario.schemaVersion).toBe(3);
  expect(imported.scenario.ci.failureDuration).toEqual({ lower: 50, upper: 70, coverage: 0.95 });
  expect(imported.scenario.ci.successDuration).toEqual({ lower: 50, upper: 70, coverage: 0.95 });
  expect(imported.scenario.llm.duration).toEqual({ lower: 1, upper: 3, coverage: 0.95 });
});

test("migrates schema v2 without inventing calibration metadata", () => {
  const { calibration: _calibration, ...current } = DEFAULT_SCENARIO;
  const previous = { ...current, schemaVersion: 2 };
  const imported = fromJson(JSON.stringify({ schemaVersion: 2, scenario: previous, policies: DEFAULT_POLICIES }));
  expect(imported.scenario.schemaVersion).toBe(3);
  expect(imported.scenario.calibration).toBeUndefined();
  expect(imported.scenario.ci).toEqual(DEFAULT_SCENARIO.ci);
});

test("round-trips v3 parameter calibration sources", () => {
  const scenario = {
    ...DEFAULT_SCENARIO,
    calibration: { parameters: {
      arrivalMean: { profileId: "bors-production-2026-q2", profileVersion: 1, appliedValue: 12 },
      ciFailureDuration: { profileId: "bors-production-2026-q2", profileVersion: 1, appliedValue: { lower: 8, upper: 35, coverage: 0.95 } },
    } },
  };
  const json = toJson(scenario, DEFAULT_POLICIES);
  expect(JSON.parse(json).schemaVersion).toBe(3);
  expect(fromJson(json).scenario).toEqual(scenario);
});

test("rejects unknown calibration parameter ids", () => {
  const scenario = { ...DEFAULT_SCENARIO, calibration: { parameters: { unknownParameter: { profileId: "x", profileVersion: 1, appliedValue: 1 } } } };
  expect(() => fromJson(JSON.stringify({ schemaVersion: 3, scenario, policies: DEFAULT_POLICIES }))).toThrow();
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
  expect(csv).toContain('batchSize');
});

test("imports a previous config-only experiment result with aligned instance ids", () => {
  const currentResult = runExperiment({ ...DEFAULT_SCENARIO, prCount: 100, targetMergeCount: 10, repetitions: 10 }, DEFAULT_POLICIES);
  const legacyResult = {
    ...currentResult,
    policies: currentResult.policies.map((policy) => policy.config),
    results: currentResult.results.map((item) => ({
      ...item,
      policy: item.policy.config,
      runs: item.runs.map((run) => ({ ...run, policy: run.policy.config })),
    })),
  };
  const imported = fromJson(JSON.stringify({
    schemaVersion: 1,
    scenario: DEFAULT_SCENARIO,
    policies: DEFAULT_POLICIES.map((policy) => policy.config),
    result: legacyResult,
  }));

  expect(imported.result?.policies).toEqual(imported.policies);
  expect(imported.result?.results.map((item) => item.policy.id)).toEqual(imported.policies.map((policy) => policy.id));
  for (const item of imported.result?.results ?? []) {
    expect(item.runs.every((run) => run.policy.id === item.policy.id)).toBe(true);
  }
});
