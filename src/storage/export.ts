import type { ExperimentResult, PolicyConfig, RunResult, ScenarioConfig } from "../sim/model";
import { importSchema } from "./schema";

export function toJson(scenario: ScenarioConfig, policies: PolicyConfig[], result?: ExperimentResult, replay?: RunResult): string {
  return JSON.stringify({ schemaVersion: 1, scenario, policies, result, replay }, null, 2);
}

export function fromJson(value: string): { scenario: ScenarioConfig; policies: PolicyConfig[]; result?: ExperimentResult } {
  return importSchema.parse(JSON.parse(value)) as { scenario: ScenarioConfig; policies: PolicyConfig[]; result?: ExperimentResult };
}

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function resultToCsv(result: ExperimentResult): string {
  const headers = ["policy", "repetition", "endReason", "mergedPrs", "defectIngressRate", "harmfulInteractionRate", "normalMergeTimeMean", "throughput", "ciRuns", "ciUtilization", "llmCalls", "llmCoverage", "falseQuarantines"];
  const rows = result.results.flatMap(({ policy, runs }) => runs.map((run) => [
    policy.kind, run.repetition, run.metrics.endReason, run.metrics.mergedPrs, run.metrics.defectIngressRate,
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
