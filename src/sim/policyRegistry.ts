import { z } from "zod";
import type { PolicyConfig, PolicyInstance, PolicyKind } from "./model";
import {
  createBatchSplitPolicy,
  createBorsPolicy,
  createLlmAssistedPolicy,
  createSequentialPolicy,
  type MergePolicy,
} from "./policies";

export interface PolicyNumberField {
  type: "number";
  key: string;
  label: string;
  description: string;
  min: number;
  max?: number;
  step?: number;
}

export interface PolicySelectField {
  type: "select";
  key: string;
  label: string;
  description: string;
  options: readonly { value: string; label: string }[];
}

export type PolicyField = PolicyNumberField | PolicySelectField;

export interface PolicyDefinition<C extends PolicyConfig = PolicyConfig> {
  kind: C["kind"];
  label: string;
  description: string;
  defaultConfig: C;
  schema: z.ZodType<C>;
  fields: readonly PolicyField[];
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

const configurableBatchFields: readonly PolicyField[] = [
  { type: "number", key: "maxBatchSize", label: "최대 배치 크기", description: "한 CI 배치에 포함할 수 있는 PR 수의 상한입니다.", min: 2, max: 100, step: 1 },
  {
    type: "select", key: "batchTiming.mode", label: "배치 구성 방식",
    description: "크기 또는 시간은 배치가 가득 차면 즉시 시작하고, 고정 지연은 크기와 무관하게 지정 시간을 기다립니다.",
    options: [{ value: "sizeOrTimeout", label: "크기 또는 시간" }, { value: "fixedDelay", label: "고정 지연" }],
  },
  { type: "number", key: "batchTiming.minutes", label: "배치 대기 시간(분)", description: "첫 PR이 배치를 만든 시점부터 CI 제출 조건을 판단할 때 사용하는 시간입니다.", min: 0, step: 1 },
  { type: "number", key: "splitRatio", label: "분할 비율", description: "실패 배치를 앞쪽 하위 배치에 배정할 비율입니다. 나머지는 뒤쪽 하위 배치가 됩니다.", min: 0.01, max: 0.99, step: 0.05 },
  {
    type: "select", key: "splitBatchScheduling", label: "분할 배치 순서",
    description: "FIFO는 준비된 모든 배치를 생성 순서로 처리하고, 분할 우선은 준비된 재검사 배치를 신규 PR 배치보다 먼저 처리합니다.",
    options: [{ value: "fifo", label: "전체 배치 FIFO" }, { value: "beforeFresh", label: "신규 PR보다 우선" }],
  },
  {
    type: "select", key: "failureRecovery.mode", label: "실패 복구 방식",
    description: "배치 실패 시 바로 분할하거나, 첫 실패에 LLM으로 의심 PR을 선별한 뒤 비의심 PR 묶음과 의심 PR 단건을 재검증합니다.",
    options: [{ value: "splitOnly", label: "배치 분할" }, { value: "llmThenSplit", label: "LLM 선별 후 분할" }],
  },
  { type: "number", key: "splitBatchDelayMinutes", label: "분할 배치 지연(분)", description: "실패 후 만들어진 분할 또는 LLM 선별 배치를 다시 CI에 제출하기 전에 기다리는 시간입니다.", min: 0, step: 1 },
];

const batchTimingSchema = z.object({
  mode: z.enum(["sizeOrTimeout", "fixedDelay"]),
  minutes: z.number().nonnegative(),
}).strict();

const failureRecoverySchema = z.object({ mode: z.enum(["splitOnly", "llmThenSplit"]) }).strict();

const batchSplitDefinition: PolicyDefinition<Extract<PolicyConfig, { kind: "batchSplit" }>> = {
  kind: "batchSplit",
  label: "배치 분할",
  description: "배치 구성·실패 분할·재검사 순서를 직접 설정",
  defaultConfig: { kind: "batchSplit", maxBatchSize: 8, splitRatio: 0.5, splitBatchScheduling: "beforeFresh", batchTiming: { mode: "sizeOrTimeout", minutes: 30 }, splitBatchDelayMinutes: 0, failureRecovery: { mode: "splitOnly" } },
  schema: z.object({
    kind: z.literal("batchSplit"), maxBatchSize: z.number().int().min(2).max(100), splitRatio: z.number().gt(0).lt(1),
    splitBatchScheduling: z.enum(["beforeFresh", "fifo"]), batchTiming: batchTimingSchema, splitBatchDelayMinutes: z.number().nonnegative(), failureRecovery: failureRecoverySchema,
  }),
  fields: configurableBatchFields,
  create: createBatchSplitPolicy,
  formatLabel: (config) => "배치 분할 (최대 " + config.maxBatchSize + " · " + (config.batchTiming.mode === "sizeOrTimeout" ? "크기/시간 " : "고정 지연 ") + config.batchTiming.minutes + "분 · 분할 " + Math.round(config.splitRatio * 100) + "% · " + (config.splitBatchScheduling === "fifo" ? "FIFO" : "분할 우선") + " · 재검사 " + config.splitBatchDelayMinutes + "분 · " + (config.failureRecovery.mode === "llmThenSplit" ? "LLM 선별" : "배치 분할") + ")",
};

const borsDefinition: PolicyDefinition<Extract<PolicyConfig, { kind: "bors" }>> = {
  kind: "bors",
  label: "Bors 프리셋",
  description: "범용 배치 분할 엔진에 Bors 방식의 기본 설정을 적용",
  defaultConfig: { kind: "bors", maxBatchSize: 8, splitRatio: 0.5, splitBatchScheduling: "fifo", batchTiming: { mode: "fixedDelay", minutes: 30 }, splitBatchDelayMinutes: 30, failureRecovery: { mode: "splitOnly" } },
  schema: z.object({
    kind: z.literal("bors"), maxBatchSize: z.number().int().min(2).max(100), splitRatio: z.number().gt(0).lt(1),
    splitBatchScheduling: z.enum(["beforeFresh", "fifo"]), batchTiming: batchTimingSchema, splitBatchDelayMinutes: z.number().nonnegative(), failureRecovery: failureRecoverySchema,
  }),
  fields: configurableBatchFields,
  create: createBorsPolicy,
  formatLabel: (config) => "Bors 프리셋 (최대 " + config.maxBatchSize + " · 지연 " + config.batchTiming.minutes + "분 · 분할 " + Math.round(config.splitRatio * 100) + "% · " + (config.splitBatchScheduling === "fifo" ? "FIFO" : "분할 우선") + " · 재검사 " + config.splitBatchDelayMinutes + "분 · " + (config.failureRecovery.mode === "llmThenSplit" ? "LLM 선별" : "배치 분할") + ")",
};

const llmAssistedDefinition: PolicyDefinition<Extract<PolicyConfig, { kind: "llmAssisted" }>> = {
  kind: "llmAssisted",
  label: "LLM 보조 프리셋",
  description: "범용 배치 엔진의 첫 실패 복구에 LLM 선별을 적용",
  defaultConfig: { kind: "llmAssisted", maxBatchSize: 8, splitRatio: 0.5, splitBatchScheduling: "beforeFresh", batchTiming: { mode: "sizeOrTimeout", minutes: 30 }, splitBatchDelayMinutes: 0, failureRecovery: { mode: "llmThenSplit" } },
  schema: z.object({
    kind: z.literal("llmAssisted"), maxBatchSize: z.number().int().min(2).max(100), splitRatio: z.number().gt(0).lt(1),
    splitBatchScheduling: z.enum(["beforeFresh", "fifo"]), batchTiming: batchTimingSchema, splitBatchDelayMinutes: z.number().nonnegative(), failureRecovery: failureRecoverySchema,
  }),
  fields: configurableBatchFields,
  create: createLlmAssistedPolicy,
  formatLabel: (config) => "LLM 보조 프리셋 (최대 " + config.maxBatchSize + " · " + (config.batchTiming.mode === "sizeOrTimeout" ? "크기/시간 " : "고정 지연 ") + config.batchTiming.minutes + "분 · 분할 " + Math.round(config.splitRatio * 100) + "% · " + (config.splitBatchScheduling === "fifo" ? "FIFO" : "분할 우선") + " · 재검사 " + config.splitBatchDelayMinutes + "분 · " + (config.failureRecovery.mode === "llmThenSplit" ? "LLM 선별" : "배치 분할") + ")",
};

export const POLICY_DEFINITIONS = [
  sequentialDefinition,
  batchSplitDefinition,
  borsDefinition,
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

const DEFAULT_POLICY_KINDS: PolicyKind[] = ["sequential", "batchSplit", "llmAssisted"];
export const DEFAULT_POLICIES: PolicyInstance[] = DEFAULT_POLICY_KINDS.map((kind) => {
  const definition = getPolicyDefinition(kind);
  return { id: `default-${kind}`, config: structuredClone(definition.defaultConfig) };
});

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
