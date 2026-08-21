import type { ExperimentResult, PolicyConfig, RunResult, ScenarioConfig, SimEvent } from "../sim/model";
import { PROTOCOL_VERSION, type WorkerRequest, type WorkerResponse } from "./protocol";

export interface RunCallbacks {
  onProgress?: (done: number, total: number) => void;
  onEvents?: (events: SimEvent[], offset: number, total: number) => void;
}

type RequestPayload =
  | { type: "runExperiment"; scenario: ScenarioConfig; policies: PolicyConfig[] }
  | { type: "replayRun"; scenario: ScenarioConfig; policy: PolicyConfig; repetition: number };

export class SimulationClient {
  private worker = new Worker(new URL("./simulation.worker.ts", import.meta.url), { type: "module" });
  private currentId?: string;

  runExperiment(scenario: ScenarioConfig, policies: PolicyConfig[], callbacks: RunCallbacks = {}): Promise<ExperimentResult> {
    return this.request<ExperimentResult>({ type: "runExperiment", scenario, policies }, callbacks, "experimentCompleted");
  }

  replay(scenario: ScenarioConfig, policy: PolicyConfig, repetition: number, callbacks: RunCallbacks = {}): Promise<RunResult> {
    return this.request<RunResult>({ type: "replayRun", scenario, policy, repetition }, callbacks, "replayCompleted");
  }

  cancel(): void {
    if (!this.currentId) return;
    this.worker.postMessage({ version: PROTOCOL_VERSION, requestId: this.currentId, type: "cancelExperiment" } satisfies WorkerRequest);
  }

  terminate(): void { this.worker.terminate(); }

  private request<T>(payload: RequestPayload, callbacks: RunCallbacks, completion: WorkerResponse["type"]): Promise<T> {
    const requestId = crypto.randomUUID();
    this.currentId = requestId;
    return new Promise<T>((resolve, reject) => {
      const listener = ({ data }: MessageEvent<WorkerResponse>) => {
        if (data.requestId !== requestId) return;
        if (data.type === "progress") callbacks.onProgress?.(data.done, data.total);
        if (data.type === "eventBatch") callbacks.onEvents?.(data.events, data.offset, data.total);
        if (data.type === "error" || data.type === "cancelled") {
          this.worker.removeEventListener("message", listener);
          this.currentId = undefined;
          reject(new Error(data.type === "error" ? data.message : "cancelled"));
        }
        if (data.type === completion) {
          this.worker.removeEventListener("message", listener);
          this.currentId = undefined;
          resolve(("result" in data ? data.result : undefined) as T);
        }
      };
      this.worker.addEventListener("message", listener);
      this.worker.postMessage({ version: PROTOCOL_VERSION, requestId, ...payload } as WorkerRequest);
    });
  }
}
