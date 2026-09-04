import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import type { ExperimentResult, PolicyInstance } from "../sim/model";
import { PolicyComparison } from "./PolicyComparison";
import { formatDuration } from "./formatDuration";

test("shows PR decision time and average CI runs as policy metrics and replays by instance id", () => {
  const policy: PolicyInstance = { id: "sequential-a", config: { kind: "sequential" } };
  const result = {
    scenario: { repetitions: 1, seed: "test" },
    policies: [policy],
    results: [{
      policy,
      summary: {
        "resolutionTime.mean": { mean: 42 },
        averageCiRunsPerResolvedPr: { mean: 1.25 },
        averageBatchSize: { mean: 4.5 },
        averageSuccessfulBatchSize: { mean: 6.25 },
        averageFailedBatchSize: { mean: 2.75 },
        singletonCiRunRate: { mean: 0.4 },
        mergedPrsPerCiRun: { mean: 3.2 },
        defectIngressRate: { mean: 0.03 },
      },
    }],
    elapsedMs: 1000,
  } as unknown as ExperimentResult;
  const onReplay = vi.fn();

  const { container } = render(<PolicyComparison result={result} onReplay={onReplay} />);
  const primaryMetric = container.querySelector(".hero-metric");
  expect(primaryMetric).toHaveTextContent("42.0분");
  expect(primaryMetric).toHaveTextContent("PR 평균 판정 시간");
  expect(container.querySelector(".metric-card dt")).toHaveTextContent("결함 PR 유입률");
  expect(screen.getByText("PR당 평균 CI 실행")).toBeInTheDocument();
  expect(screen.getByText("1.25회")).toBeInTheDocument();
  expect(screen.getByText("배치당 PR 평균 개수")).toBeInTheDocument();
  expect(screen.getByText("4.50개")).toBeInTheDocument();
  expect(screen.getByText("성공 배치의 PR 평균 개수")).toBeInTheDocument();
  expect(screen.getByText("6.25개")).toBeInTheDocument();
  expect(screen.getByText("실패 배치의 PR 평균 개수")).toBeInTheDocument();
  expect(screen.getByText("2.75개")).toBeInTheDocument();
  expect(screen.getByText("단독 CI 실행 비율")).toBeInTheDocument();
  expect(screen.getByText("40.00%")).toBeInTheDocument();
  expect(screen.getByText("CI 실행당 최종 머지 PR 수")).toBeInTheDocument();
  expect(screen.getByText("3.20개")).toBeInTheDocument();
  expect(screen.queryByText("상호작용 유입")).not.toBeInTheDocument();
  const metricHelp = screen.getByRole("tooltip");
  expect(screen.getByRole("button", { name: "결과 지표 도움말" })).toHaveAttribute("aria-describedby", metricHelp.id);
  expect(metricHelp).toHaveTextContent("전체 머지된 PR 중 개별 결함을 가진 PR의 비율");
  expect(metricHelp).toHaveTextContent("격리된 PR 중 individualDefect가 false인 PR 수");
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
