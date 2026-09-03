import type { EmpiricalDurationDistribution } from "./model";
import { CI_FAILURE_DURATION_OBSERVATIONS, CI_SUCCESS_DURATION_OBSERVATIONS } from "./ciDurationObservations";

export const REALITY_DEFAULT_PROFILE_ID = "bors-production-observed";
export const REALITY_DEFAULT_PROFILE_VERSION = 1;

const empirical = (observations: ReadonlyArray<readonly [number, number]>): EmpiricalDurationDistribution => ({
  kind: "empirical",
  observations: observations.map(([minutes, count]) => [minutes, count]),
});

export const REALITY_DEFAULTS = {
  dailyPrCount: 13,
  individualDefectProbability: 0.14,
  interactionSetsPerHundredPrs: 0,
  ciFailureDuration: empirical(CI_FAILURE_DURATION_OBSERVATIONS),
  ciSuccessDuration: empirical(CI_SUCCESS_DURATION_OBSERVATIONS),
  ciFalseNegativeRate: 0,
  ciFalsePositiveRate: 0,
  llmCulpritHitRate: 0.95,
  llmInnocentFalseAccusationRate: 0.05,
} as const;
