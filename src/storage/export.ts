import type { ExperimentResult, PolicyInstance, RunResult, ScenarioConfig } from "../sim/model";
import { policyLabel } from "../sim/policyRegistry";
import { importSchema, normalizePolicyInstances, normalizeScenarioConfig, policyInstanceSchema } from "./schema";
import { policyConfigSchema } from "../sim/policyRegistry";

export function toJson(scenario: ScenarioConfig, policies: PolicyInstance[], result?: ExperimentResult, replay?: RunResult): string {
  return JSON.stringify({ schemaVersion: 2, scenario, policies, result, replay }, null, 2);
}

function normalizeResultPolicy(value: unknown, fallback: PolicyInstance | undefined, index: number): PolicyInstance {
  const current = policyInstanceSchema.safeParse(value);
  if (current.success) return current.data;
  const legacy = policyConfigSchema.safeParse(value);
  if (legacy.success) return { id: fallback?.id ?? `legacy-result-policy-${index + 1}-${legacy.data.kind}`, config: legacy.data };
  if (fallback) return fallback;
  throw new Error("실험 결과에 유효한 정책이 없습니다.");
}

export function normalizeExperimentResult(value: unknown, fallbackPolicies: PolicyInstance[]): ExperimentResult | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object") throw new Error("실험 결과 형식이 올바르지 않습니다.");
  const raw = value as Record<string, unknown>;
  const resultPolicies = raw.policies === undefined ? fallbackPolicies : normalizePolicyInstances(raw.policies);
  if (!Array.isArray(raw.results)) throw new Error("실험 정책 결과 형식이 올바르지 않습니다.");
  const results = raw.results.map((candidate, index) => {
    if (!candidate || typeof candidate !== "object") throw new Error("정책 결과 형식이 올바르지 않습니다.");
    const item = candidate as Record<string, unknown>;
    const policy = normalizeResultPolicy(item.policy, resultPolicies[index] ?? fallbackPolicies[index], index);
    const runs = Array.isArray(item.runs)
      ? item.runs.map((run) => run && typeof run === "object" ? { ...run, policy } : run)
      : item.runs;
    return { ...item, policy, runs };
  });
  return { ...raw, scenario: normalizeScenarioConfig(raw.scenario), policies: resultPolicies, results } as unknown as ExperimentResult;
}

export function fromJson(value: string): { scenario: ScenarioConfig; policies: PolicyInstance[]; result?: ExperimentResult } {
  const imported = importSchema.parse(JSON.parse(value));
  const policies = normalizePolicyInstances(imported.policies);
  return { scenario: normalizeScenarioConfig(imported.scenario), policies, result: normalizeExperimentResult(imported.result, policies) };
}

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function resultToCsv(result: ExperimentResult): string {
  const headers = ["policyId", "policyKind", "policyLabel", "policyConfig", "repetition", "endReason", "mergedPrs", "defectIngressRate", "harmfulInteractionRate", "normalMergeTimeMean", "throughput", "ciRuns", "ciUtilization", "llmCalls", "llmCoverage", "falseQuarantines"];
  const rows = result.results.flatMap(({ policy, runs }) => runs.map((run) => [
    policy.id, policy.config.kind, policyLabel(policy), JSON.stringify(policy.config),
    run.repetition, run.metrics.endReason, run.metrics.mergedPrs, run.metrics.defectIngressRate,
    run.metrics.harmfulInteractionRate, run.metrics.normalMergeTime.mean, run.metrics.throughput,
    run.metrics.ciRuns, run.metrics.ciUtilization, run.metrics.llmCalls, run.metrics.llmCoverage, run.metrics.falseQuarantines,
  ]));
  return [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
}

export function downloadText(name: string, content: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}
