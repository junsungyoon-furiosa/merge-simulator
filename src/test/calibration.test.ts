import { describe, expect, test } from "vitest";
import { applicableParameterIds, applyCalibration, calibrationSourceState, clearCalibration, previewCalibration } from "../calibration/applyCalibration";
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
    dailyPrCount: { ...BORS_PRODUCTION_2026_Q2.parameters.dailyPrCount, estimate: { status: "recommended", value: 12 } },
    ciFailureDuration: { ...BORS_PRODUCTION_2026_Q2.parameters.ciFailureDuration, estimate: { status: "provisional", value: { lower: 8, upper: 35, coverage: 0.95 } } },
  },
};

describe("environment calibration", () => {
  test("registers exactly ten stable parameters in PR, CI, LLM order", () => {
    expect(PARAMETER_REGISTRY).toHaveLength(10);
    expect(new Set(PARAMETER_REGISTRY.map(({ id }) => id)).size).toBe(10);
    expect(PARAMETER_REGISTRY.map(({ group }) => group)).toEqual(["PR", "PR", "PR", "CI", "CI", "CI", "CI", "LLM", "LLM", "LLM"]);
  });

  test("the Bors profile provides all collected defaults except LLM duration", () => {
    expect(Object.keys(BORS_PRODUCTION_2026_Q2.parameters)).toHaveLength(10);
    expect(applicableParameterIds(BORS_PRODUCTION_2026_Q2)).toEqual(PARAMETER_REGISTRY.map(({ id }) => id).filter((id) => id !== "llmDuration"));
  });

  test("previews and applies only selected values with provenance", () => {
    const preview = previewCalibration(DEFAULT_SCENARIO, profileWithValues, ["dailyPrCount", "ciFailureDuration"]);
    expect(preview.map(({ id }) => id)).toEqual(["dailyPrCount", "ciFailureDuration"]);
    const applied = applyCalibration(DEFAULT_SCENARIO, profileWithValues, ["dailyPrCount"]);
    expect(applied.arrival).toEqual({ ...DEFAULT_SCENARIO.arrival, meanPerDay: 12 });
    expect(applied.ci).toEqual(DEFAULT_SCENARIO.ci);
    expect(applied.calibration?.parameters.dailyPrCount).toEqual({ profileId: "fixture", profileVersion: 2, appliedValue: 12 });
    expect(calibrationSourceState(applied, "dailyPrCount")).toBe("applied");
    expect(calibrationSourceState({ ...applied, arrival: { ...applied.arrival, meanPerDay: 13 } }, "dailyPrCount")).toBe("modified");
    expect(clearCalibration(applied, "dailyPrCount").calibration?.parameters.dailyPrCount).toBeUndefined();
  });

  test("preserves the hourly arrival profile when applying daily volume", () => {
    const applied = applyCalibration(DEFAULT_SCENARIO, profileWithValues, ["dailyPrCount"]);
    expect(applied.arrival.hourlyWeights).toEqual(DEFAULT_SCENARIO.arrival.hourlyWeights);
    expect(applied.arrival.timezone).toBe("Asia/Seoul");
  });
});
