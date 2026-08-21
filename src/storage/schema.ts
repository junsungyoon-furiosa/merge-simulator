import { z } from "zod";

const fixed = z.object({ kind: z.literal("fixed"), value: z.number().positive() });
const uniform = z.object({ kind: z.literal("uniform"), min: z.number().nonnegative(), max: z.number().positive() }).refine((value) => value.max >= value.min, "최댓값은 최솟값 이상이어야 합니다.");
const exponential = z.object({ kind: z.literal("exponential"), mean: z.number().positive() });
const logNormal = z.object({ kind: z.literal("logNormal"), median: z.number().positive(), sigma: z.number().nonnegative() });
export const distributionSchema = z.union([fixed, uniform, exponential, logNormal]);

export const scenarioSchema = z.object({
  schemaVersion: z.literal(1),
  name: z.string().min(1).max(100),
  seed: z.string().min(1).max(100),
  prCount: z.number().int().min(100).max(1000),
  targetMergeCount: z.number().int().positive(),
  repetitions: z.number().int().min(10).max(100),
  arrival: distributionSchema,
  individualDefectProbability: z.number().min(0).max(1),
  interactionDefects: z.object({
    setsPerHundredPrs: z.number().min(0).max(100),
    maxSize: z.number().int().min(2).max(10),
    sizeWeights: z.record(z.string(), z.number().nonnegative()),
  }),
  ci: z.object({
    duration: distributionSchema,
    falseNegativeRate: z.number().min(0).max(1),
    falsePositiveRate: z.number().min(0).max(1),
    costPerRun: z.number().nonnegative().optional(),
  }),
  llm: z.object({
    duration: distributionSchema,
    culpritHitRate: z.number().min(0).max(1),
    innocentFalseAccusationRate: z.number().min(0).max(1),
    costPerCall: z.number().nonnegative().optional(),
  }),
}).refine((value) => value.targetMergeCount <= value.prCount, { path: ["targetMergeCount"], message: "목표 머지 수는 전체 PR 수 이하여야 합니다." });

export const policySchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("sequential") }),
  z.object({ kind: z.literal("batchSplit"), batchSize: z.number().int().min(2).max(100), maxWait: z.number().nonnegative(), splitRatio: z.number().gt(0).lt(1) }),
  z.object({ kind: z.literal("llmAssisted"), batchSize: z.number().int().min(2).max(100), maxWait: z.number().nonnegative() }),
]);

export const importSchema = z.object({
  schemaVersion: z.literal(1),
  scenario: scenarioSchema,
  policies: z.array(policySchema).min(1).max(3),
  result: z.unknown().optional(),
  replay: z.unknown().optional(),
});
