import type { EnvironmentParameterId, EnvironmentParameterValueMap, ScenarioConfig } from "../sim/model";

export type ParameterGroup = "PR" | "CI" | "LLM";

export interface ParameterDefinition<K extends EnvironmentParameterId = EnvironmentParameterId> {
  id: K;
  group: ParameterGroup;
  label: string;
  unit: string;
  read: (scenario: ScenarioConfig) => EnvironmentParameterValueMap[K] | undefined;
  write: (scenario: ScenarioConfig, value: EnvironmentParameterValueMap[K]) => ScenarioConfig;
  format: (value: EnvironmentParameterValueMap[K]) => string;
  equals: (left: EnvironmentParameterValueMap[K], right: EnvironmentParameterValueMap[K]) => boolean;
}

const numberEquals = (left: number, right: number) => Object.is(left, right);
const durationEquals = (left: EnvironmentParameterValueMap["ciFailureDuration"], right: EnvironmentParameterValueMap["ciFailureDuration"]) =>
  left.lower === right.lower && left.upper === right.upper && left.coverage === right.coverage;
const percent = (value: number) => `${Number((value * 100).toFixed(4))}%`;
const duration = (value: EnvironmentParameterValueMap["ciFailureDuration"]) =>
  `${Number((value.coverage * 100).toFixed(4))}% 중앙 구간 ${value.lower}–${value.upper}분`;

const defineParameter = <K extends EnvironmentParameterId>(definition: ParameterDefinition<K>) => definition;

export const PARAMETER_REGISTRY = [
  defineParameter({
    id: "dailyPrCount", group: "PR", label: "근무일당 평균 PR 생성 수", unit: "PR/일",
    read: (scenario) => scenario.arrival.meanPerDay,
    write: (scenario, value) => ({ ...scenario, arrival: { ...scenario.arrival, meanPerDay: value } }),
    format: (value) => String(value) + " PR/일", equals: numberEquals,
  }),
  defineParameter({
    id: "individualDefectProbability", group: "PR", label: "개별 결함률", unit: "%",
    read: (scenario) => scenario.individualDefectProbability,
    write: (scenario, value) => ({ ...scenario, individualDefectProbability: value }),
    format: percent, equals: numberEquals,
  }),
  defineParameter({
    id: "ciFailureDuration", group: "CI", label: "CI 실패 시간 중앙 확률 구간", unit: "분",
    read: (scenario) => scenario.ci.failureDuration,
    write: (scenario, value) => ({ ...scenario, ci: { ...scenario.ci, failureDuration: value } }),
    format: duration, equals: durationEquals,
  }),
  defineParameter({
    id: "ciSuccessDuration", group: "CI", label: "CI 성공 시간 중앙 확률 구간", unit: "분",
    read: (scenario) => scenario.ci.successDuration,
    write: (scenario, value) => ({ ...scenario, ci: { ...scenario.ci, successDuration: value } }),
    format: duration, equals: durationEquals,
  }),
  defineParameter({
    id: "ciFalseNegativeRate", group: "CI", label: "CI 거짓 음성률", unit: "%",
    read: (scenario) => scenario.ci.falseNegativeRate,
    write: (scenario, value) => ({ ...scenario, ci: { ...scenario.ci, falseNegativeRate: value } }),
    format: percent, equals: numberEquals,
  }),
  defineParameter({
    id: "ciFalsePositiveRate", group: "CI", label: "CI 거짓 양성률", unit: "%",
    read: (scenario) => scenario.ci.falsePositiveRate,
    write: (scenario, value) => ({ ...scenario, ci: { ...scenario.ci, falsePositiveRate: value } }),
    format: percent, equals: numberEquals,
  }),
  defineParameter({
    id: "llmCulpritHitRate", group: "LLM", label: "LLM 적중률", unit: "%",
    read: (scenario) => scenario.llm.culpritHitRate,
    write: (scenario, value) => ({ ...scenario, llm: { ...scenario.llm, culpritHitRate: value } }),
    format: percent, equals: numberEquals,
  }),
  defineParameter({
    id: "llmInnocentFalseAccusationRate", group: "LLM", label: "LLM 오지목률", unit: "%",
    read: (scenario) => scenario.llm.innocentFalseAccusationRate,
    write: (scenario, value) => ({ ...scenario, llm: { ...scenario.llm, innocentFalseAccusationRate: value } }),
    format: percent, equals: numberEquals,
  }),
  defineParameter({
    id: "llmDuration", group: "LLM", label: "LLM 판단 시간 중앙 확률 구간", unit: "분",
    read: (scenario) => scenario.llm.duration,
    write: (scenario, value) => ({ ...scenario, llm: { ...scenario.llm, duration: value } }),
    format: duration, equals: durationEquals,
  }),
] as const;

export function getParameterDefinition<K extends EnvironmentParameterId>(id: K): ParameterDefinition<K> {
  return PARAMETER_REGISTRY.find((definition) => definition.id === id) as unknown as ParameterDefinition<K>;
}
