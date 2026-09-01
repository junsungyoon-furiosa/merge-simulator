import { expect, test } from "vitest";
import { runExperiment } from "../sim/experiment";
import { DEFAULT_SCENARIO, type PolicyConfig } from "../sim/model";
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
  const currentResult = runExperiment({ ...DEFAULT_SCENARIO, prCount: 20, targetMergeCount: 10, repetitions: 1 }, DEFAULT_POLICIES);
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
