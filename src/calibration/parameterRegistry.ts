import type { DurationModel, EnvironmentParameterId, EnvironmentParameterValueMap, ScenarioConfig } from "../sim/model";
import { durationCentralInterval, isEmpiricalDuration } from "../sim/random";

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
const durationEquals = (left: DurationModel, right: DurationModel) => {
  if (isEmpiricalDuration(left) || isEmpiricalDuration(right)) {
    return isEmpiricalDuration(left) && isEmpiricalDuration(right)
      && left.observations.length === right.observations.length
      && left.observations.every(([minutes, count], index) => minutes === right.observations[index]?.[0] && count === right.observations[index]?.[1]);
  }
  return left.lower === right.lower && left.upper === right.upper && left.coverage === right.coverage;
};
const percent = (value: number) => `${Number((value * 100).toFixed(4))}%`;
const duration = (value: DurationModel) => {
  const interval = durationCentralInterval(value);
  const sampleText = isEmpiricalDuration(value)
    ? "경험적 분포 " + value.observations.reduce((sum, [, count]) => sum + count, 0) + "건 · "
    : "";
  return sampleText + Number((interval.coverage * 100).toFixed(4)) + "% 중앙 구간 " + interval.lower + "–" + interval.upper + "분";
};

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
    id: "interactionSetsPerHundredPrs", group: "PR", label: "상호작용 / 100 PR", unit: "세트",
    read: (scenario) => scenario.interactionDefects.setsPerHundredPrs,
    write: (scenario, value) => ({ ...scenario, interactionDefects: { ...scenario.interactionDefects, setsPerHundredPrs: value } }),
    format: (value) => String(value) + "세트 / 100 PR", equals: numberEquals,
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
