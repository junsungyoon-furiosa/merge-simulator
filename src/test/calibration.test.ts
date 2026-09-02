import { describe, expect, test } from "vitest";
import { applicableParameterIds, applyCalibration, calibrationSourceState, previewCalibration } from "../calibration/applyCalibration";
import type { CalibrationProfile } from "../calibration/model";
import { PARAMETER_REGISTRY } from "../calibration/parameterRegistry";
import { BORS_PRODUCTION_2026_Q2 } from "../calibration/profiles/borsProduction2026Q2";
import { DEFAULT_SCENARIO } from "../sim/model";

const profileWithValues: CalibrationProfile = {
  ...BORS_PRODUCTION_2026_Q2,
  id: "fixture",
  version: 2,
  parameters: {
    ...BORS_PRODUCTION_2026_Q2.parameters,
    arrivalMean: { ...BORS_PRODUCTION_2026_Q2.parameters.arrivalMean, estimate: { status: "recommended", value: 12 } },
    ciFailureDuration: { ...BORS_PRODUCTION_2026_Q2.parameters.ciFailureDuration, estimate: { status: "provisional", value: { lower: 8, upper: 35, coverage: 0.95 } } },
  },
};

describe("environment calibration", () => {
  test("registers exactly nine stable parameters in PR, CI, LLM order", () => {
    expect(PARAMETER_REGISTRY).toHaveLength(9);
    expect(new Set(PARAMETER_REGISTRY.map(({ id }) => id)).size).toBe(9);
    expect(PARAMETER_REGISTRY.map(({ group }) => group)).toEqual(["PR", "PR", "CI", "CI", "CI", "CI", "LLM", "LLM", "LLM"]);
  });

  test("the initial Bors profile documents all values but applies none", () => {
    expect(Object.keys(BORS_PRODUCTION_2026_Q2.parameters)).toHaveLength(9);
    expect(applicableParameterIds(BORS_PRODUCTION_2026_Q2)).toEqual([]);
  });

  test("previews and applies only selected values with provenance", () => {
    const preview = previewCalibration(DEFAULT_SCENARIO, profileWithValues, ["arrivalMean", "ciFailureDuration"]);
    expect(preview.map(({ id }) => id)).toEqual(["arrivalMean", "ciFailureDuration"]);
    const applied = applyCalibration(DEFAULT_SCENARIO, profileWithValues, ["arrivalMean"]);
    expect(applied.arrival).toEqual({ kind: "exponential", mean: 12 });
    expect(applied.ci).toEqual(DEFAULT_SCENARIO.ci);
    expect(applied.calibration?.parameters.arrivalMean).toEqual({ profileId: "fixture", profileVersion: 2, appliedValue: 12 });
    expect(calibrationSourceState(applied, "arrivalMean")).toBe("applied");
    expect(calibrationSourceState({ ...applied, arrival: { kind: "exponential", mean: 13 } }, "arrivalMean")).toBe("modified");
  });

  test("does not apply arrival mean to a non-exponential distribution", () => {
    const uniform = { ...DEFAULT_SCENARIO, arrival: { kind: "uniform" as const, min: 1, max: 2 } };
    expect(applyCalibration(uniform, profileWithValues, ["arrivalMean"])).toEqual(uniform);
  });
});
