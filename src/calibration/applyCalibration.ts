import type { CalibrationProfile } from "./model";
import { getParameterDefinition, PARAMETER_REGISTRY } from "./parameterRegistry";
import type { EnvironmentParameterId, EnvironmentParameterValueMap, ScenarioConfig } from "../sim/model";

export type CalibrationSourceState = "direct" | "applied" | "modified";

export interface CalibrationPreviewItem {
  id: EnvironmentParameterId;
  label: string;
  currentText: string;
  nextText: string;
  changed: boolean;
}

export function applicableParameterIds(profile: CalibrationProfile): EnvironmentParameterId[] {
  return PARAMETER_REGISTRY
    .filter(({ id }) => profile.parameters[id].estimate.status !== "none")
    .map(({ id }) => id);
}

export function previewCalibration(scenario: ScenarioConfig, profile: CalibrationProfile, ids: EnvironmentParameterId[]): CalibrationPreviewItem[] {
  return ids.flatMap((id) => {
    const definition = getParameterDefinition(id);
    const current = definition.read(scenario);
    const estimate = profile.parameters[id].estimate;
    if (current === undefined || estimate.status === "none") return [];
    const next = estimate.value as EnvironmentParameterValueMap[typeof id];
    return [{
      id,
      label: definition.label,
      currentText: definition.format(current),
      nextText: definition.format(next),
      changed: !definition.equals(current, next),
    }];
  });
}

export function applyCalibration(scenario: ScenarioConfig, profile: CalibrationProfile, ids: EnvironmentParameterId[]): ScenarioConfig {
  let next = scenario;
  const parameters = { ...(scenario.calibration?.parameters ?? {}) };
  for (const id of ids) {
    const definition = getParameterDefinition(id);
    const estimate = profile.parameters[id].estimate;
    if (definition.read(next) === undefined || estimate.status === "none") continue;
    const value = structuredClone(estimate.value) as EnvironmentParameterValueMap[typeof id];
    next = definition.write(next, value);
    parameters[id] = { profileId: profile.id, profileVersion: profile.version, appliedValue: value } as never;
  }
  return Object.keys(parameters).length > 0 ? { ...next, calibration: { parameters } } : next;
}

export function clearCalibration(scenario: ScenarioConfig, id: EnvironmentParameterId): ScenarioConfig {
  if (!scenario.calibration?.parameters[id]) return scenario;
  const parameters = { ...scenario.calibration.parameters };
  delete parameters[id];
  if (Object.keys(parameters).length === 0) {
    const { calibration: _calibration, ...withoutCalibration } = scenario;
    return withoutCalibration;
  }
  return { ...scenario, calibration: { parameters } };
}

export function calibrationSourceState(scenario: ScenarioConfig, id: EnvironmentParameterId): CalibrationSourceState {
  const source = scenario.calibration?.parameters[id];
  if (!source) return "direct";
  const current = getParameterDefinition(id).read(scenario);
  if (current === undefined) return "modified";
  return getParameterDefinition(id).equals(current, source.appliedValue as never) ? "applied" : "modified";
}
