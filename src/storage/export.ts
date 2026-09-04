import type { ExperimentResult, PolicyInstance, RunResult, ScenarioConfig } from "../sim/model";
import { policyLabel } from "../sim/policyRegistry";
import { importSchema, normalizePolicyInstances, normalizeScenarioConfig, policyInstanceSchema } from "./schema";

export function toJson(scenario: ScenarioConfig, policies: PolicyInstance[], result?: ExperimentResult, replay?: RunResult): string {
  return JSON.stringify({ schemaVersion: 1, scenario, policies, result, replay }, null, 2);
}

function normalizeResultPolicy(value: unknown): PolicyInstance {
  return policyInstanceSchema.parse(value);
}

function normalizeStoredRun(value: unknown, policy: PolicyInstance): unknown {
  if (!value || typeof value !== "object") return value;
  const run = value as Record<string, unknown>;
  if (!run.metrics || typeof run.metrics !== "object") return { ...run, policy };
  const metrics = run.metrics as Record<string, unknown>;
  const finalStates = metrics.finalStates && typeof metrics.finalStates === "object"
    ? metrics.finalStates as Record<string, unknown>
    : {};
  return { ...run, policy, metrics: { ...metrics, finalStates: { notSuspected: 0, ...finalStates } } };
}

export function normalizeExperimentResult(value: unknown): ExperimentResult | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object") throw new Error("실험 결과 형식이 올바르지 않습니다.");
  const raw = value as Record<string, unknown>;
  if (raw.policies === undefined) throw new Error("실험 결과에 정책 목록이 없습니다.");
  const resultPolicies = normalizePolicyInstances(raw.policies);
  if (!Array.isArray(raw.results)) throw new Error("실험 정책 결과 형식이 올바르지 않습니다.");
  const results = raw.results.map((candidate) => {
    if (!candidate || typeof candidate !== "object") throw new Error("정책 결과 형식이 올바르지 않습니다.");
    const item = candidate as Record<string, unknown>;
    const policy = normalizeResultPolicy(item.policy);
    const runs = Array.isArray(item.runs)
      ? item.runs.map((run) => normalizeStoredRun(run, policy))
      : item.runs;
    return { ...item, policy, runs };
  });
  return { ...raw, scenario: normalizeScenarioConfig(raw.scenario), policies: resultPolicies, results } as unknown as ExperimentResult;
}

export function fromJson(value: string): { scenario: ScenarioConfig; policies: PolicyInstance[]; result?: ExperimentResult } {
  const imported = importSchema.parse(JSON.parse(value));
  const policies = normalizePolicyInstances(imported.policies);
  return { scenario: normalizeScenarioConfig(imported.scenario), policies, result: normalizeExperimentResult(imported.result) };
}

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function resultToCsv(result: ExperimentResult): string {
  const headers = ["policyId", "policyKind", "policyLabel", "policyConfig", "repetition", "endReason", "mergedPrs", "defectIngressRate", "harmfulInteractionRate", "resolutionTimeMean", "averageCiRunsPerResolvedPr", "averageBatchSize", "averageSuccessfulBatchSize", "averageFailedBatchSize", "singletonCiRunRate", "mergedPrsPerCiRun", "normalMergeTimeMean", "throughput", "ciRuns", "ciUtilization", "llmCalls", "llmCoverage", "falseQuarantines"];
  const rows = result.results.flatMap(({ policy, runs }) => runs.map((run) => [
    policy.id, policy.config.kind, policyLabel(policy), JSON.stringify(policy.config),
    run.repetition, run.metrics.endReason, run.metrics.mergedPrs, run.metrics.defectIngressRate,
    run.metrics.harmfulInteractionRate, run.metrics.resolutionTime.mean, run.metrics.averageCiRunsPerResolvedPr, run.metrics.averageBatchSize, run.metrics.averageSuccessfulBatchSize, run.metrics.averageFailedBatchSize, run.metrics.singletonCiRunRate, run.metrics.mergedPrsPerCiRun, run.metrics.normalMergeTime.mean, run.metrics.throughput,
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
