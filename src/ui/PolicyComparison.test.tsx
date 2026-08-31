import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import type { ExperimentResult, PolicyConfig } from "../sim/model";
import { PolicyComparison } from "./PolicyComparison";
import { formatDuration } from "./formatDuration";

test("shows normal PR merge time as the primary policy metric", () => {
  const policy: PolicyConfig = { kind: "sequential" };
  const result = {
    scenario: { repetitions: 1, seed: "test" },
    policies: [policy],
    results: [{
      policy,
      summary: {
        "normalMergeTime.mean": { mean: 42 },
        defectIngressRate: { mean: 0.03 },
      },
    }],
    elapsedMs: 1000,
  } as unknown as ExperimentResult;

  const { container } = render(<PolicyComparison result={result} onReplay={() => undefined} />);
  const primaryMetric = container.querySelector(".hero-metric");
  expect(primaryMetric).toHaveTextContent("42.0분");
  expect(primaryMetric).toHaveTextContent("정상 PR 평균 머지");
  expect(screen.getByText("결함 PR 유입률").tagName).toBe("DT");
});
test("formats long merge times with hours and days", () => {
  expect(formatDuration(null)).toBe("—");
  expect(formatDuration(42)).toBe("42.0분");
  expect(formatDuration(185)).toBe("3시간 5분");
  expect(formatDuration(1590)).toBe("1일 2.5시간");
});
