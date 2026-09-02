import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import type { CalibrationProfile } from "../calibration/model";
import { BORS_PRODUCTION_2026_Q2 } from "../calibration/profiles/borsProduction2026Q2";
import { DEFAULT_SCENARIO } from "../sim/model";
import EnvironmentEvidencePage from "./EnvironmentEvidencePage";

const profile: CalibrationProfile = {
  ...BORS_PRODUCTION_2026_Q2,
  id: "ui-fixture",
  parameters: {
    ...BORS_PRODUCTION_2026_Q2.parameters,
    arrivalMean: {
      ...BORS_PRODUCTION_2026_Q2.parameters.arrivalMean,
      estimate: { status: "recommended", value: 12 },
    },
  },
};

test("shows evidence and applies a profiled value after preview", () => {
  const onScenario = vi.fn();
  render(<EnvironmentEvidencePage scenario={DEFAULT_SCENARIO} onScenario={onScenario} profile={profile} />);

  expect(screen.getByRole("heading", { name: "환경값 근거" })).toBeInTheDocument();
  expect(screen.getByText("1 / 9")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "이 값 적용" }));
  expect(screen.getByRole("dialog", { name: "관측·추정값을 적용할까요?" })).toBeInTheDocument();
  expect(screen.getAllByText("10분")[0]).toBeInTheDocument();
  expect(screen.getAllByText("12분")[0]).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "취소" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(onScenario).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole("button", { name: "적용 가능한 값 모두 적용" }));
  fireEvent.click(screen.getByRole("button", { name: "적용" }));

  expect(onScenario).toHaveBeenCalledWith(expect.objectContaining({
    arrival: { kind: "exponential", mean: 12 },
    calibration: { parameters: { arrivalMean: { profileId: "ui-fixture", profileVersion: 1, appliedValue: 12 } } },
  }));
});
