import type { ExperimentResult, PolicyInstance, RunResult, ScenarioConfig, SimEvent } from "../sim/model";

export const PROTOCOL_VERSION = 1;

export type WorkerRequest =
  | { version: 1; requestId: string; type: "runExperiment"; scenario: ScenarioConfig; policies: PolicyInstance[] }
  | { version: 1; requestId: string; type: "cancelExperiment" }
  | { version: 1; requestId: string; type: "replayRun"; scenario: ScenarioConfig; policy: PolicyInstance; repetition: number }
  | { version: 1; requestId: string; type: "loadScenario"; scenario: ScenarioConfig };

export type WorkerResponse =
  | { version: 1; requestId: string; type: "progress"; done: number; total: number }
  | { version: 1; requestId: string; type: "experimentCompleted"; result: ExperimentResult }
  | { version: 1; requestId: string; type: "eventBatch"; events: SimEvent[]; offset: number; total: number }
  | { version: 1; requestId: string; type: "replayCompleted"; result: RunResult }
  | { version: 1; requestId: string; type: "cancelled" }
  | { version: 1; requestId: string; type: "error"; message: string };
