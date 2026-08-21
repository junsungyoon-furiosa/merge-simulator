/// <reference lib="webworker" />
import { runSimulation } from "../sim/engine";
import { summarizeRuns } from "../sim/experiment";
import type { ExperimentResult, PolicyExperimentResult } from "../sim/model";
import type { WorkerRequest, WorkerResponse } from "./protocol";

const scope: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope;
let cancelled = false;

const send = (message: WorkerResponse) => scope.postMessage(message);
const yieldToMessages = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

scope.onmessage = async ({ data }: MessageEvent<WorkerRequest>) => {
  if (data.type === "cancelExperiment") { cancelled = true; return; }
  try {
    if (data.type === "loadScenario") return;
    cancelled = false;
    if (data.type === "replayRun") {
      const result = runSimulation(data.scenario, data.policy, data.repetition);
      for (let offset = 0; offset < result.events.length; offset += 250) {
        send({ version: 1, requestId: data.requestId, type: "eventBatch", events: result.events.slice(offset, offset + 250), offset, total: result.events.length });
        await yieldToMessages();
        if (cancelled) { send({ version: 1, requestId: data.requestId, type: "cancelled" }); return; }
      }
      send({ version: 1, requestId: data.requestId, type: "replayCompleted", result });
      return;
    }
    const started = performance.now();
    const total = data.scenario.repetitions * data.policies.length;
    let done = 0;
    const results: PolicyExperimentResult[] = [];
    for (const policy of data.policies) {
      const runs: PolicyExperimentResult["runs"] = [];
      for (let repetition = 0; repetition < data.scenario.repetitions; repetition += 1) {
        if (cancelled) { send({ version: 1, requestId: data.requestId, type: "cancelled" }); return; }
        const { events: _events, ...run } = runSimulation(data.scenario, policy, repetition);
        runs.push(run);
        done += 1;
        send({ version: 1, requestId: data.requestId, type: "progress", done, total });
        await yieldToMessages();
      }
      results.push(summarizeRuns(policy, runs));
    }
    const result: ExperimentResult = { id: crypto.randomUUID(), createdAt: new Date().toISOString(), scenario: data.scenario, policies: data.policies, results, elapsedMs: performance.now() - started };
    send({ version: 1, requestId: data.requestId, type: "experimentCompleted", result });
  } catch (error) {
    send({ version: 1, requestId: data.requestId, type: "error", message: error instanceof Error ? error.message : String(error) });
  }
};

export {};
