import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import type { ExperimentResult, PolicyInstance } from "../sim/model";
import { PolicyComparison } from "./PolicyComparison";
import { formatDuration } from "./formatDuration";

test("shows normal PR merge time as the primary policy metric and replays by instance id", () => {
  const policy: PolicyInstance = { id: "sequential-a", config: { kind: "sequential" } };
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
  const onReplay = vi.fn();

  const { container } = render(<PolicyComparison result={result} onReplay={onReplay} />);
  const primaryMetric = container.querySelector(".hero-metric");
  expect(primaryMetric).toHaveTextContent("42.0분");
  expect(primaryMetric).toHaveTextContent("정상 PR 평균 머지");
  expect(screen.getByText("결함 PR 유입률").tagName).toBe("DT");
  fireEvent.click(screen.getByRole("button", { name: /실행 재생/ }));
  expect(onReplay).toHaveBeenCalledWith("sequential-a");
});

test("renders more than three policy instances with unique ids", () => {
  const policies: PolicyInstance[] = Array.from({ length: 4 }, (_, index) => ({
    id: `policy-${index + 1}`,
    config: { kind: "sequential" },
  }));
  const result = {
    scenario: { repetitions: 1, seed: "test" },
    policies,
    results: policies.map((policy) => ({ policy, summary: {} })),
    elapsedMs: 1000,
  } as unknown as ExperimentResult;

  const { container } = render(<PolicyComparison result={result} onReplay={() => undefined} />);
  expect(container.querySelectorAll(".metric-card")).toHaveLength(4);
  expect([...container.querySelectorAll(".metric-card")].map((card) => card.getAttribute("data-policy-id"))).toEqual(policies.map((policy) => policy.id));
});

test("formats long merge times with hours and days", () => {
  expect(formatDuration(null)).toBe("—");
  expect(formatDuration(42)).toBe("42.0분");
  expect(formatDuration(185)).toBe("3시간 5분");
  expect(formatDuration(1590)).toBe("1일 2.5시간");
});
