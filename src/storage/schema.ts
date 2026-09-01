import { z } from "zod";
import { DEFAULT_DURATION_COVERAGE, type Distribution, type DurationInterval, type PolicyConfig, type PolicyInstance, type ScenarioConfig } from "../sim/model";
import { policyConfigSchema } from "../sim/policyRegistry";

const fixed = z.object({ kind: z.literal("fixed"), value: z.number().positive() });
const uniform = z.object({ kind: z.literal("uniform"), min: z.number().nonnegative(), max: z.number().positive() }).refine((value) => value.max >= value.min, "최댓값은 최솟값 이상이어야 합니다.");
const exponential = z.object({ kind: z.literal("exponential"), mean: z.number().positive() });
const logNormal = z.object({ kind: z.literal("logNormal"), median: z.number().positive(), sigma: z.number().nonnegative() });
export const distributionSchema = z.union([fixed, uniform, exponential, logNormal]);

export const durationIntervalSchema = z.object({
  lower: z.number().positive(),
  upper: z.number().positive(),
  coverage: z.number().gt(0).lt(1),
}).refine((value) => value.upper >= value.lower, "상한은 하한 이상이어야 합니다.");

export const scenarioSchema = z.object({
  schemaVersion: z.literal(2),
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
    failureDuration: durationIntervalSchema,
    successDuration: durationIntervalSchema,
    falseNegativeRate: z.number().min(0).max(1),
    falsePositiveRate: z.number().min(0).max(1),
    costPerRun: z.number().nonnegative().optional(),
  }),
  llm: z.object({
    duration: durationIntervalSchema,
    culpritHitRate: z.number().min(0).max(1),
    innocentFalseAccusationRate: z.number().min(0).max(1),
    costPerCall: z.number().nonnegative().optional(),
  }),
}).refine((value) => value.targetMergeCount <= value.prCount, { path: ["targetMergeCount"], message: "목표 머지 수는 전체 PR 수 이하여야 합니다." });


const legacyScenarioSchema = z.object({
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
}).refine((value) => value.targetMergeCount <= value.prCount);

function intervalFromLegacy(distribution: Distribution): DurationInterval {
  if (distribution.kind === "fixed") return { lower: distribution.value, upper: distribution.value, coverage: DEFAULT_DURATION_COVERAGE };
  if (distribution.kind === "uniform") return { lower: Math.max(Number.MIN_VALUE, distribution.min), upper: distribution.max, coverage: DEFAULT_DURATION_COVERAGE };
  if (distribution.kind === "exponential") return {
    lower: -Math.log(0.975) * distribution.mean,
    upper: -Math.log(0.025) * distribution.mean,
    coverage: DEFAULT_DURATION_COVERAGE,
  };
  const boundaryZ = 1.959963984540054;
  return {
    lower: distribution.median * Math.exp(-boundaryZ * distribution.sigma),
    upper: distribution.median * Math.exp(boundaryZ * distribution.sigma),
    coverage: DEFAULT_DURATION_COVERAGE,
  };
}

export function normalizeScenarioConfig(value: unknown): ScenarioConfig {
  const current = scenarioSchema.safeParse(value);
  if (current.success) return current.data;
  const legacy = legacyScenarioSchema.parse(value);
  const ciDuration = intervalFromLegacy(legacy.ci.duration);
  return scenarioSchema.parse({
    ...legacy,
    schemaVersion: 2,
    ci: { ...legacy.ci, duration: undefined, failureDuration: ciDuration, successDuration: ciDuration },
    llm: { ...legacy.llm, duration: intervalFromLegacy(legacy.llm.duration) },
  });
}

export const policyInstanceSchema: z.ZodType<PolicyInstance> = z.object({
  id: z.string().min(1).max(200),
  config: policyConfigSchema,
});

export const policyInstancesSchema = z.array(policyInstanceSchema).min(1).superRefine((policies, context) => {
  const seen = new Set<string>();
  policies.forEach((policy, index) => {
    if (seen.has(policy.id)) context.addIssue({ code: "custom", path: [index, "id"], message: "정책 ID는 중복될 수 없습니다." });
    seen.add(policy.id);
  });
});

const storedPolicySchema = z.union([policyInstanceSchema, policyConfigSchema]);
const storedPoliciesSchema = z.array(storedPolicySchema).min(1);

export function normalizePolicyInstances(value: unknown): PolicyInstance[] {
  const stored = storedPoliciesSchema.parse(value);
  const used = new Set<string>();
  const normalized = stored.map((entry, index) => {
    const config: PolicyConfig = "config" in entry ? entry.config : entry;
    const baseId = "config" in entry ? entry.id : `legacy-policy-${index + 1}-${config.kind}`;
    let id = baseId;
    let suffix = 2;
    while (used.has(id)) id = `${baseId}-${suffix++}`;
    used.add(id);
    return { id, config };
  });
  return policyInstancesSchema.parse(normalized);
}

export const importSchema = z.object({
  schemaVersion: z.union([z.literal(1), z.literal(2)]),
  scenario: z.unknown(),
  policies: storedPoliciesSchema,
  result: z.unknown().optional(),
  replay: z.unknown().optional(),
});
