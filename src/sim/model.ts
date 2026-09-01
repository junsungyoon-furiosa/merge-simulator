export type PrId = string;
export type BatchId = string;
export type SimTime = number;

export type Distribution =
  | { kind: "fixed"; value: number }
  | { kind: "uniform"; min: number; max: number }
  | { kind: "exponential"; mean: number }
  | { kind: "logNormal"; median: number; sigma: number };

export type PolicyConfig =
  | { kind: "sequential" }
  | { kind: "batchSplit"; batchSize: number; maxWait: number; splitRatio: number }
  | { kind: "bors"; maxBatchSize: number; batchDelay: number; splitBatchScheduling: "beforeFresh" | "fifo" }
  | { kind: "llmAssisted"; batchSize: number; maxWait: number };

export type PolicyKind = PolicyConfig["kind"];

export interface PolicyInstance {
  id: string;
  config: PolicyConfig;
}

export interface ScenarioConfig {
  schemaVersion: 1;
  name: string;
  seed: string;
  prCount: number;
  targetMergeCount: number;
  repetitions: number;
  arrival: Distribution;
  individualDefectProbability: number;
  interactionDefects: {
    setsPerHundredPrs: number;
    maxSize: number;
    sizeWeights: Record<number, number>;
  };
  ci: {
    duration: Distribution;
    falseNegativeRate: number;
    falsePositiveRate: number;
    costPerRun?: number;
  };
  llm: {
    duration: Distribution;
    culpritHitRate: number;
    innocentFalseAccusationRate: number;
    costPerCall?: number;
  };
}

export const DEFAULT_SCENARIO: ScenarioConfig = {
  schemaVersion: 1,
  name: "기본 비교 실험",
  seed: "demo-1",
  prCount: 500,
  targetMergeCount: 400,
  repetitions: 30,
  arrival: { kind: "exponential", mean: 10 },
  individualDefectProbability: 0.01,
  interactionDefects: { setsPerHundredPrs: 1, maxSize: 4, sizeWeights: { 2: 0.7, 3: 0.2, 4: 0.1 } },
  ci: { duration: { kind: "uniform", min: 50, max: 70 }, falseNegativeRate: 0.01, falsePositiveRate: 0.01 },
  llm: { duration: { kind: "uniform", min: 1, max: 3 }, culpritHitRate: 0.7, innocentFalseAccusationRate: 0.1 },
};


export type PrStatus = "scheduled" | "waiting" | "ciWaiting" | "ciRunning" | "investigating" | "suspected" | "merged" | "quarantined";

export interface PullRequest {
  id: PrId;
  index: number;
  arrivalTime: number;
  status: PrStatus;
  individualDefect: boolean;
  mergedAt?: number;
  quarantinedAt?: number;
}

export interface InteractionDefect {
  id: string;
  members: PrId[];
}

export interface HiddenWorld {
  prs: PullRequest[];
  interactions: InteractionDefect[];
}

export interface FailedBatchRecord {
  id: BatchId;
  prIds: PrId[];
  hint: string;
  llmRequested: boolean;
  llmCompleted: boolean;
  suspects?: PrId[];
  allowLlm: boolean;
}

export type EventType =
  | "prArrived" | "policyDecided" | "ciQueued" | "ciStarted" | "ciCompleted" | "ciInvalidated"
  | "llmStarted" | "llmCompleted" | "prStateChanged" | "masterChanged" | "runEnded";

export interface SimEvent {
  seq: number;
  time: number;
  type: EventType;
  prIds?: PrId[];
  batchId?: BatchId;
  from?: PrStatus;
  to?: PrStatus;
  data?: Record<string, unknown>;
}

export type EndReason = "targetReached" | "exhausted" | "stalled" | "userCancelled" | "policyError";

export interface RunMetrics {
  endReason: EndReason;
  simulatedTime: number;
  createdPrs: number;
  mergedPrs: number;
  mergedHealthyPrs: number;
  mergedDefectivePrs: number;
  defectIngressRate: number | null;
  harmfulInteractionsMerged: number;
  harmfulInteractionRate: number | null;
  masterBecameUnhealthy: number;
  unhealthyMasterDuration: number;
  normalMergeTime: DistributionStats;
  quarantineTime: DistributionStats;
  throughput: number | null;
  normalThroughput: number | null;
  defectiveThroughput: number | null;
  ciRuns: number;
  ciSuccesses: number;
  ciFailures: number;
  ciInvalidations: number;
  ciRetries: number;
  ciUtilization: number | null;
  ciIdleTime: number;
  llmCalls: number;
  llmSuccesses: number;
  llmPartialFailures: number;
  llmFailures: number;
  llmCoverage: number | null;
  llmFalseAccusationRate: number | null;
  llmDuration: DistributionStats;
  quarantinedPrs: number;
  falseQuarantines: number;
  ciRunsWhileMasterUnhealthy: number;
  mergesWhileMasterUnhealthy: number;
  averageQueueLength: number;
  maxQueueLength: number;
  averageWaitTime: number | null;
  p95WaitTime: number | null;
  ciCost: number | null;
  llmCost: number | null;
  finalStates: Record<PrStatus, number>;
}

export interface DistributionStats {
  count: number;
  mean: number | null;
  min: number | null;
  max: number | null;
  variance: number | null;
  p50: number | null;
  p90: number | null;
  p95: number | null;
  p99: number | null;
}

export interface RunResult {
  policy: PolicyInstance;
  repetition: number;
  seed: string;
  events: SimEvent[];
  metrics: RunMetrics;
}

export interface MetricSummary {
  mean: number | null;
  min: number | null;
  max: number | null;
  p50: number | null;
  p95: number | null;
  ci95Low: number | null;
  ci95High: number | null;
}

export interface PolicyExperimentResult {
  policy: PolicyInstance;
  runs: Array<Omit<RunResult, "events">>;
  summary: Record<string, MetricSummary>;
}

export interface ExperimentResult {
  id: string;
  createdAt: string;
  scenario: ScenarioConfig;
  policies: PolicyInstance[];
  results: PolicyExperimentResult[];
  elapsedMs: number;
}
