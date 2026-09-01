import { z } from "zod";
import type { PolicyConfig, PolicyInstance, PolicyKind } from "./model";
import {
  createBatchSplitPolicy,
  createLlmAssistedPolicy,
  createSequentialPolicy,
  type MergePolicy,
} from "./policies";

export interface PolicyNumberField {
  key: string;
  label: string;
  min: number;
  max?: number;
  step?: number;
}

export interface PolicyDefinition<C extends PolicyConfig = PolicyConfig> {
  kind: C["kind"];
  label: string;
  description: string;
  defaultConfig: C;
  schema: z.ZodType<C>;
  fields: readonly PolicyNumberField[];
  create(config: C): MergePolicy;
  formatLabel(config: C): string;
}

const sequentialDefinition: PolicyDefinition<Extract<PolicyConfig, { kind: "sequential" }>> = {
  kind: "sequential",
  label: "순차 CI",
  description: "PR을 한 개씩 검사",
  defaultConfig: { kind: "sequential" },
  schema: z.object({ kind: z.literal("sequential") }),
  fields: [],
  create: createSequentialPolicy,
  formatLabel: () => "순차 CI",
};

const batchSplitDefinition: PolicyDefinition<Extract<PolicyConfig, { kind: "batchSplit" }>> = {
  kind: "batchSplit",
  label: "배치 분할",
  description: "배치 실패 시 하위 배치로 분할",
  defaultConfig: { kind: "batchSplit", batchSize: 8, maxWait: 30, splitRatio: 0.5 },
  schema: z.object({
    kind: z.literal("batchSplit"),
    batchSize: z.number().int().min(2).max(100),
    maxWait: z.number().nonnegative(),
    splitRatio: z.number().gt(0).lt(1),
  }),
  fields: [
    { key: "batchSize", label: "배치 크기", min: 2, max: 100, step: 1 },
    { key: "maxWait", label: "최대 대기", min: 0, step: 1 },
    { key: "splitRatio", label: "분할 비율", min: 0.01, max: 0.99, step: 0.05 },
  ],
  create: createBatchSplitPolicy,
  formatLabel: (config) => `배치 분할 (배치 ${config.batchSize} · 대기 ${config.maxWait} · 분할 ${Math.round(config.splitRatio * 100)}%)`,
};

const llmAssistedDefinition: PolicyDefinition<Extract<PolicyConfig, { kind: "llmAssisted" }>> = {
  kind: "llmAssisted",
  label: "LLM 보조",
  description: "실패 배치의 LLM 의심 결과를 후속 CI에 활용",
  defaultConfig: { kind: "llmAssisted", batchSize: 8, maxWait: 30 },
  schema: z.object({
    kind: z.literal("llmAssisted"),
    batchSize: z.number().int().min(2).max(100),
    maxWait: z.number().nonnegative(),
  }),
  fields: [
    { key: "batchSize", label: "배치 크기", min: 2, max: 100, step: 1 },
    { key: "maxWait", label: "최대 대기", min: 0, step: 1 },
  ],
  create: createLlmAssistedPolicy,
  formatLabel: (config) => `LLM 보조 (배치 ${config.batchSize} · 대기 ${config.maxWait})`,
};

export const POLICY_DEFINITIONS = [
  sequentialDefinition,
  batchSplitDefinition,
  llmAssistedDefinition,
] as const;

const definitionByKind = new Map<PolicyKind, PolicyDefinition>(
  POLICY_DEFINITIONS.map((definition) => [definition.kind, definition as PolicyDefinition]),
);

const policySchemas = POLICY_DEFINITIONS.map((definition) => definition.schema) as unknown as readonly [
  z.ZodType<PolicyConfig>,
  z.ZodType<PolicyConfig>,
  ...z.ZodType<PolicyConfig>[],
];
export const policyConfigSchema: z.ZodType<PolicyConfig> = z.union(policySchemas);

export const DEFAULT_POLICIES: PolicyInstance[] = POLICY_DEFINITIONS.map((definition) => ({
  id: `default-${definition.kind}`,
  config: structuredClone(definition.defaultConfig),
}));

export function getPolicyDefinition(kind: string): PolicyDefinition {
  const definition = definitionByKind.get(kind as PolicyKind);
  if (!definition) throw new Error(`Unknown policy kind: ${kind}`);
  return definition;
}

export function createPolicy(config: PolicyConfig): MergePolicy {
  const definition = getPolicyDefinition(config.kind);
  return definition.create(config);
}

export function createPolicyInstance(kind: PolicyKind, id = crypto.randomUUID()): PolicyInstance {
  const definition = getPolicyDefinition(kind);
  return { id, config: structuredClone(definition.defaultConfig) };
}

export function policyLabel(policy: PolicyConfig | PolicyInstance): string {
  const config = "config" in policy ? policy.config : policy;
  const definition = getPolicyDefinition(config.kind);
  return definition.formatLabel(config);
}
