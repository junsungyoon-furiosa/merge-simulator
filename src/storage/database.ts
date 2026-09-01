import { openDB, type DBSchema } from "idb";
import type { ExperimentResult, PolicyConfig, PolicyInstance, ScenarioConfig } from "../sim/model";
import { normalizeExperimentResult } from "./export";
import { normalizePolicyInstances, normalizeScenarioConfig } from "./schema";

interface MergeSimulatorDb extends DBSchema {
  scenarios: { key: string; value: { id: string; updatedAt: string; scenario: ScenarioConfig; policies: PolicyInstance[] | PolicyConfig[] } };
  experiments: { key: string; value: ExperimentResult };
}

const db = () => openDB<MergeSimulatorDb>("merge-lab", 1, {
  upgrade(database) {
    database.createObjectStore("scenarios", { keyPath: "id" });
    database.createObjectStore("experiments", { keyPath: "id" });
  },
});

export async function saveScenario(scenario: ScenarioConfig, policies: PolicyInstance[]): Promise<void> {
  const database = await db();
  await database.put("scenarios", { id: "current", updatedAt: new Date().toISOString(), scenario, policies });
}

export async function loadScenario(): Promise<{ scenario: ScenarioConfig; policies: PolicyInstance[] } | undefined> {
  const database = await db();
  const stored = await database.get("scenarios", "current");
  return stored ? { scenario: normalizeScenarioConfig(stored.scenario), policies: normalizePolicyInstances(stored.policies) } : undefined;
}

export async function saveExperiment(result: ExperimentResult): Promise<void> {
  const database = await db();
  await database.put("experiments", result);
}

export async function listExperiments(): Promise<ExperimentResult[]> {
  const database = await db();
  return (await database.getAll("experiments"))
    .map((result) => normalizeExperimentResult(result, normalizePolicyInstances((result as unknown as { policies: unknown }).policies))!)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
