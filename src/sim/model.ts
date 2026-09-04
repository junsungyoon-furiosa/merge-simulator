import { REALITY_DEFAULT_PROFILE_ID, REALITY_DEFAULT_PROFILE_VERSION, REALITY_DEFAULTS } from "./realityDefaults";

export type PrId = string;
export type BatchId = string;
export type SimTime = number;

export type Distribution =
  | { kind: "fixed"; value: number }
  | { kind: "uniform"; min: number; max: number }
  | { kind: "exponential"; mean: number }
  | { kind: "logNormal"; median: number; sigma: number };

export interface DurationInterval {
  lower: number;
  upper: number;
  coverage: number;
}

export interface EmpiricalDurationDistribution {
  kind: "empirical";
  observations: Array<[minutes: number, count: number]>;
}

export type DurationModel = DurationInterval | EmpiricalDurationDistribution;

export const KST_HOURLY_ARRIVAL_WEIGHTS = [
  60, 19, 4, 4, 0, 5, 7, 10,
  31, 68, 167, 210, 164, 301, 268, 276,
  310, 316, 256, 259, 244, 160, 102, 93,
] as const;

export interface DailyArrivalProfile {
  kind: "dailyProfile";
  meanPerDay: number;
  timezone: "Asia/Seoul";
  hourlyWeights: number[];
}

export type EnvironmentParameterId =
  | "dailyPrCount"
  | "individualDefectProbability"
  | "interactionSetsPerHundredPrs"
  | "ciFailureDuration"
  | "ciSuccessDuration"
  | "ciFalseNegativeRate"
  | "ciFalsePositiveRate"
  | "llmCulpritHitRate"
  | "llmInnocentFalseAccusationRate"
  | "llmDuration";

export interface EnvironmentParameterValueMap {
  dailyPrCount: number;
  individualDefectProbability: number;
  interactionSetsPerHundredPrs: number;
  ciFailureDuration: DurationModel;
  ciSuccessDuration: DurationModel;
  ciFalseNegativeRate: number;
  ciFalsePositiveRate: number;
  llmCulpritHitRate: number;
  llmInnocentFalseAccusationRate: number;
  llmDuration: DurationInterval;
}

export type ParameterCalibrationSourceMap = {
  [K in EnvironmentParameterId]?: {
    profileId: string;
    profileVersion: number;
    appliedValue: EnvironmentParameterValueMap[K];
  };
};

export interface ScenarioCalibration {
  parameters: ParameterCalibrationSourceMap;
}

export const DEFAULT_DURATION_COVERAGE = 0.95;

export type SplitBatchScheduling = "beforeFresh" | "fifo";
export type BatchTimingMode = "sizeOrTimeout" | "fixedDelay";
export type FailureRecoveryMode = "splitOnly" | "llmThenSplit";

export interface ConfigurableBatchSettings {
  maxBatchSize: number;
  splitRatio: number;
  splitBatchScheduling: SplitBatchScheduling;
  batchTiming: { mode: BatchTimingMode; minutes: number };
  splitBatchDelayMinutes: number;
  failureRecovery: { mode: FailureRecoveryMode };
}

export type PolicyConfig =
  | { kind: "sequential" }
  | ({ kind: "batchSplit" } & ConfigurableBatchSettings)
  | ({ kind: "bors" } & ConfigurableBatchSettings)
  | ({ kind: "llmAssisted" } & ConfigurableBatchSettings);

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
  arrival: DailyArrivalProfile;
  individualDefectProbability: number;
  interactionDefects: {
    setsPerHundredPrs: number;
    maxSize: number;
    sizeWeights: Record<number, number>;
  };
  ci: {
    failureDuration: DurationModel;
    successDuration: DurationModel;
    falseNegativeRate: number;
    falsePositiveRate: number;
    costPerRun?: number;
  };
  llm: {
    duration: DurationInterval;
    culpritHitRate: number;
    innocentFalseAccusationRate: number;
    costPerCall?: number;
  };
  calibration?: ScenarioCalibration;
}

export const DEFAULT_SCENARIO: ScenarioConfig = {
  schemaVersion: 1,
  name: "기본 비교 실험",
  seed: "demo-1",
  prCount: 500,
  targetMergeCount: 400,
  repetitions: 30,
  arrival: {
    kind: "dailyProfile",
    meanPerDay: REALITY_DEFAULTS.dailyPrCount,
    timezone: "Asia/Seoul",
    hourlyWeights: [...KST_HOURLY_ARRIVAL_WEIGHTS],
  },
  individualDefectProbability: REALITY_DEFAULTS.individualDefectProbability,
  interactionDefects: { setsPerHundredPrs: REALITY_DEFAULTS.interactionSetsPerHundredPrs, maxSize: 4, sizeWeights: { 2: 0.7, 3: 0.2, 4: 0.1 } },
  ci: {
    failureDuration: REALITY_DEFAULTS.ciFailureDuration,
    successDuration: REALITY_DEFAULTS.ciSuccessDuration,
    falseNegativeRate: REALITY_DEFAULTS.ciFalseNegativeRate,
    falsePositiveRate: REALITY_DEFAULTS.ciFalsePositiveRate,
  },
  llm: {
    duration: { lower: 1, upper: 3, coverage: DEFAULT_DURATION_COVERAGE },
    culpritHitRate: REALITY_DEFAULTS.llmCulpritHitRate,
    innocentFalseAccusationRate: REALITY_DEFAULTS.llmInnocentFalseAccusationRate,
  },
  calibration: {
    parameters: {
      dailyPrCount: { profileId: REALITY_DEFAULT_PROFILE_ID, profileVersion: REALITY_DEFAULT_PROFILE_VERSION, appliedValue: REALITY_DEFAULTS.dailyPrCount },
      individualDefectProbability: { profileId: REALITY_DEFAULT_PROFILE_ID, profileVersion: REALITY_DEFAULT_PROFILE_VERSION, appliedValue: REALITY_DEFAULTS.individualDefectProbability },
      interactionSetsPerHundredPrs: { profileId: REALITY_DEFAULT_PROFILE_ID, profileVersion: REALITY_DEFAULT_PROFILE_VERSION, appliedValue: REALITY_DEFAULTS.interactionSetsPerHundredPrs },
      ciFailureDuration: { profileId: REALITY_DEFAULT_PROFILE_ID, profileVersion: REALITY_DEFAULT_PROFILE_VERSION, appliedValue: REALITY_DEFAULTS.ciFailureDuration },
      ciSuccessDuration: { profileId: REALITY_DEFAULT_PROFILE_ID, profileVersion: REALITY_DEFAULT_PROFILE_VERSION, appliedValue: REALITY_DEFAULTS.ciSuccessDuration },
      ciFalseNegativeRate: { profileId: REALITY_DEFAULT_PROFILE_ID, profileVersion: REALITY_DEFAULT_PROFILE_VERSION, appliedValue: REALITY_DEFAULTS.ciFalseNegativeRate },
      ciFalsePositiveRate: { profileId: REALITY_DEFAULT_PROFILE_ID, profileVersion: REALITY_DEFAULT_PROFILE_VERSION, appliedValue: REALITY_DEFAULTS.ciFalsePositiveRate },
      llmCulpritHitRate: { profileId: REALITY_DEFAULT_PROFILE_ID, profileVersion: REALITY_DEFAULT_PROFILE_VERSION, appliedValue: REALITY_DEFAULTS.llmCulpritHitRate },
      llmInnocentFalseAccusationRate: { profileId: REALITY_DEFAULT_PROFILE_ID, profileVersion: REALITY_DEFAULT_PROFILE_VERSION, appliedValue: REALITY_DEFAULTS.llmInnocentFalseAccusationRate },
    },
  },
};


export type PrStatus = "scheduled" | "waiting" | "ciWaiting" | "ciRunning" | "investigating" | "notSuspected" | "suspected" | "merged" | "quarantined";

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
  resolutionTime: DistributionStats;
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
  averageCiRunsPerResolvedPr: number | null;
  averageBatchSize: number | null;
  averageSuccessfulBatchSize: number | null;
  averageFailedBatchSize: number | null;
  singletonCiRunRate: number | null;
  mergedPrsPerCiRun: number | null;
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
