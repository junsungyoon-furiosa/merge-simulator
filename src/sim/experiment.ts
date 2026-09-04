import { runSimulation } from "./engine";
import { describe } from "./metrics";
import type { ExperimentResult, MetricSummary, PolicyExperimentResult, PolicyInstance, RunMetrics, ScenarioConfig } from "./model";

const METRIC_PATHS = [
  "mergedPrs", "defectIngressRate", "harmfulInteractionRate", "resolutionTime.mean", "resolutionTime.p95", "normalMergeTime.mean", "normalMergeTime.p95",
  "throughput", "normalThroughput", "defectiveThroughput", "ciRuns", "ciRetries", "averageCiRunsPerResolvedPr", "averageBatchSize", "averageSuccessfulBatchSize", "averageFailedBatchSize", "singletonCiRunRate", "mergedPrsPerCiRun", "ciUtilization", "llmCalls", "llmCoverage", "llmDuration.mean", "falseQuarantines", "averageQueueLength", "p95WaitTime",
];

function valueAt(metrics: RunMetrics, path: string): number | null {
  let current: unknown = metrics;
  for (const key of path.split(".")) current = (current as Record<string, unknown>)[key];
  return typeof current === "number" && Number.isFinite(current) ? current : null;
}

export function summarize(values: number[]): MetricSummary {
  const stats = describe(values);
  if (!values.length || stats.mean === null) return { mean: null, min: null, max: null, p50: null, p95: null, ci95Low: null, ci95High: null };
  const standardError = Math.sqrt((stats.variance ?? 0) / values.length);
  return { mean: stats.mean, min: stats.min, max: stats.max, p50: stats.p50, p95: stats.p95, ci95Low: stats.mean - 1.96 * standardError, ci95High: stats.mean + 1.96 * standardError };
}

export function summarizeRuns(policy: PolicyInstance, runs: PolicyExperimentResult["runs"]): PolicyExperimentResult {
  const summary = Object.fromEntries(METRIC_PATHS.map((path) => [path, summarize(runs.map((run) => valueAt(run.metrics, path)).filter((value): value is number => value !== null))]));
  return { policy, runs, summary };
}

export function runExperiment(config: ScenarioConfig, policies: PolicyInstance[], onProgress?: (done: number, total: number) => void, isCancelled?: () => boolean): ExperimentResult {
  const started = performance.now();
  const total = config.repetitions * policies.length;
  let done = 0;
  const results: PolicyExperimentResult[] = policies.map((policy) => {
    const runs: PolicyExperimentResult["runs"] = [];
    for (let repetition = 0; repetition < config.repetitions; repetition += 1) {
      if (isCancelled?.()) break;
      const { events: _events, ...run } = runSimulation(config, policy, repetition);
      runs.push(run);
      onProgress?.(++done, total);
    }
    return summarizeRuns(policy, runs);
  });
  return { id: crypto.randomUUID(), createdAt: new Date().toISOString(), scenario: config, policies, results, elapsedMs: performance.now() - started };
}
