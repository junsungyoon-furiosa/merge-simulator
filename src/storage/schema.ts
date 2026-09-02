import { z } from "zod";
import type { PolicyInstance, ScenarioConfig } from "../sim/model";
import { policyConfigSchema } from "../sim/policyRegistry";

export const durationIntervalSchema = z.object({
  lower: z.number().positive(),
  upper: z.number().positive(),
  coverage: z.number().gt(0).lt(1),
}).strict().refine((value) => value.upper >= value.lower, "상한은 하한 이상이어야 합니다.");

const probabilitySchema = z.number().min(0).max(1);
const calibrationSourceSchema = <T extends z.ZodTypeAny>(valueSchema: T) => z.object({
  profileId: z.string().min(1).max(200),
  profileVersion: z.number().int().positive(),
  appliedValue: valueSchema,
}).strict();

const calibrationParametersSchema = z.object({
  dailyPrCount: calibrationSourceSchema(z.number().min(0.1)).optional(),
  individualDefectProbability: calibrationSourceSchema(probabilitySchema).optional(),
  ciFailureDuration: calibrationSourceSchema(durationIntervalSchema).optional(),
  ciSuccessDuration: calibrationSourceSchema(durationIntervalSchema).optional(),
  ciFalseNegativeRate: calibrationSourceSchema(probabilitySchema).optional(),
  ciFalsePositiveRate: calibrationSourceSchema(probabilitySchema).optional(),
  llmCulpritHitRate: calibrationSourceSchema(probabilitySchema).optional(),
  llmInnocentFalseAccusationRate: calibrationSourceSchema(probabilitySchema).optional(),
  llmDuration: calibrationSourceSchema(durationIntervalSchema).optional(),
}).strict().refine((value) => Object.keys(value).length > 0, "적용된 환경값 출처가 하나 이상이어야 합니다.");

const scenarioCalibrationSchema = z.object({ parameters: calibrationParametersSchema }).strict();
const hourlyWeightsSchema = z.array(z.number().nonnegative()).length(24)
  .refine((weights) => weights.some((weight) => weight > 0), "시간대별 가중치 합은 0보다 커야 합니다.");

export const scenarioSchema = z.object({
  schemaVersion: z.literal(1),
  name: z.string().min(1).max(100),
  seed: z.string().min(1).max(100),
  prCount: z.number().int().min(100).max(1000),
  targetMergeCount: z.number().int().positive(),
  repetitions: z.number().int().min(10).max(100),
  arrival: z.object({
    kind: z.literal("dailyProfile"),
    meanPerDay: z.number().min(0.1),
    timezone: z.literal("Asia/Seoul"),
    hourlyWeights: hourlyWeightsSchema,
  }).strict(),
  individualDefectProbability: probabilitySchema,
  interactionDefects: z.object({
    setsPerHundredPrs: z.number().min(0).max(100),
    maxSize: z.number().int().min(2).max(10),
    sizeWeights: z.record(z.string(), z.number().nonnegative()),
  }).strict(),
  ci: z.object({
    failureDuration: durationIntervalSchema,
    successDuration: durationIntervalSchema,
    falseNegativeRate: probabilitySchema,
    falsePositiveRate: probabilitySchema,
    costPerRun: z.number().nonnegative().optional(),
  }).strict(),
  llm: z.object({
    duration: durationIntervalSchema,
    culpritHitRate: probabilitySchema,
    innocentFalseAccusationRate: probabilitySchema,
    costPerCall: z.number().nonnegative().optional(),
  }).strict(),
  calibration: scenarioCalibrationSchema.optional(),
}).strict().refine((value) => value.targetMergeCount <= value.prCount, {
  path: ["targetMergeCount"],
  message: "목표 머지 수는 전체 PR 수 이하여야 합니다.",
}) as z.ZodType<ScenarioConfig>;

export function normalizeScenarioConfig(value: unknown): ScenarioConfig {
  return scenarioSchema.parse(value);
}

export const policyInstanceSchema: z.ZodType<PolicyInstance> = z.object({
  id: z.string().min(1).max(200),
  config: policyConfigSchema,
}).strict();

export const policyInstancesSchema = z.array(policyInstanceSchema).min(1).superRefine((policies, context) => {
  const seen = new Set<string>();
  policies.forEach((policy, index) => {
    if (seen.has(policy.id)) context.addIssue({ code: "custom", path: [index, "id"], message: "정책 ID는 중복될 수 없습니다." });
    seen.add(policy.id);
  });
});

export function normalizePolicyInstances(value: unknown): PolicyInstance[] {
  return policyInstancesSchema.parse(value);
}

export const importSchema = z.object({
  schemaVersion: z.literal(1),
  scenario: z.unknown(),
  policies: policyInstancesSchema,
  result: z.unknown().optional(),
  replay: z.unknown().optional(),
}).strict();
