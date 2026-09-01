import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { DEFAULT_SCENARIO, type ExperimentResult, type PolicyInstance } from "../sim/model";
import { DEFAULT_POLICIES } from "../sim/policyRegistry";
import { App } from "./App";

const simulation = vi.hoisted(() => ({
  runExperiment: vi.fn(), replay: vi.fn(), cancel: vi.fn(), terminate: vi.fn(),
}));
const storage = vi.hoisted(() => ({
  loadScenario: vi.fn(), saveScenario: vi.fn(), saveExperiment: vi.fn(),
}));

vi.mock("../worker/client", () => ({
  SimulationClient: class {
    runExperiment = simulation.runExperiment;
    replay = simulation.replay;
    cancel = simulation.cancel;
    terminate = simulation.terminate;
  },
}));
vi.mock("../storage/database", () => storage);

beforeEach(() => {
  vi.clearAllMocks();
  storage.loadScenario.mockResolvedValue(undefined);
  storage.saveScenario.mockResolvedValue(undefined);
  storage.saveExperiment.mockResolvedValue(undefined);
});
afterEach(cleanup);

test("renders the simulator's primary action and registered default policies", () => {
  render(<App />);
  expect(screen.getByRole("button", { name: /시뮬레이션 시작/ })).toBeInTheDocument();
  expect(screen.getAllByText(/순차 CI/).length).toBeGreaterThan(0);
  expect(screen.getAllByText(/배치 분할/).length).toBeGreaterThan(0);
  expect(screen.getAllByText(/LLM 보조/).length).toBeGreaterThan(0);
  expect(screen.getByRole("option", { name: "Bors 기준" })).toBeInTheDocument();
});

test("provides help tooltips for every scenario field", () => {
  render(<App />);
  expect(screen.getAllByRole("button", { name: "도움말" })).toHaveLength(19);
  expect(screen.getByText(/비정상인 후보 master를 CI가 성공으로 잘못 판정/)).toHaveAttribute("role", "tooltip");
});

test("adds, duplicates, and removes policy instances with unique ids", () => {
  const { container } = render(<App />);
  fireEvent.change(screen.getByLabelText("추가할 정책"), { target: { value: "batchSplit" } });
  fireEvent.click(screen.getByRole("button", { name: "정책 추가" }));
  expect(container.querySelectorAll(".policy-instance")).toHaveLength(4);

  fireEvent.click(screen.getByRole("button", { name: "4번 배치 분할 복제" }));
  expect(container.querySelectorAll(".policy-instance")).toHaveLength(5);
  expect([...container.querySelectorAll(".policy-instance-heading strong")].filter((item) => item.textContent === "배치 분할")).toHaveLength(3);

  const ids = [...container.querySelectorAll(".policy-instance")].map((item) => item.getAttribute("data-policy-id"));
  expect(new Set(ids).size).toBe(ids.length);

  fireEvent.click(screen.getByRole("button", { name: "5번 배치 분할 제거" }));
  expect(container.querySelectorAll(".policy-instance")).toHaveLength(4);
});

test("adds and configures the registered bors policy", () => {
  render(<App />);
  fireEvent.change(screen.getByLabelText("추가할 정책"), { target: { value: "bors" } });
  fireEvent.click(screen.getByRole("button", { name: "정책 추가" }));

  expect(screen.getByText("Bors 기준", { selector: ".policy-instance-heading strong" })).toBeInTheDocument();
  expect(screen.getByLabelText("4번 Bors 기준 최대 배치 크기")).toHaveValue(8);
  expect(screen.getByLabelText("4번 Bors 기준 배치 지연")).toHaveValue(30);
  expect(screen.getByLabelText("4번 Bors 기준 분할 배치 순서")).toHaveValue("fifo");

  fireEvent.change(screen.getByLabelText("4번 Bors 기준 분할 배치 순서"), { target: { value: "beforeFresh" } });
  expect(screen.getByLabelText("4번 Bors 기준 분할 배치 순서")).toHaveValue("beforeFresh");
});

test("resets all scenario and policy inputs to recommended defaults", async () => {
  simulation.runExperiment.mockReturnValueOnce(new Promise(() => undefined));
  const { container } = render(<App />);

  fireEvent.change(screen.getByLabelText("실험 이름"), { target: { value: "임의 설정" } });
  fireEvent.change(screen.getByLabelText("전체 PR"), { target: { value: "700" } });
  fireEvent.change(screen.getByLabelText("CI 최소 시간"), { target: { value: "5" } });
  fireEvent.change(screen.getByLabelText("LLM 적중률"), { target: { value: "25" } });
  fireEvent.change(screen.getByLabelText("CI 1회 비용"), { target: { value: "9" } });
  fireEvent.change(screen.getByLabelText("2번 배치 분할 배치 크기"), { target: { value: "16" } });
  fireEvent.change(screen.getByLabelText("3번 LLM 보조 배치 크기"), { target: { value: "20" } });
  fireEvent.click(screen.getByRole("button", { name: "정책 추가" }));

  fireEvent.click(screen.getByRole("button", { name: "기본값으로 초기화" }));

  expect(screen.getByLabelText("실험 이름")).toHaveValue(DEFAULT_SCENARIO.name);
  expect(screen.getByLabelText("전체 PR")).toHaveValue(DEFAULT_SCENARIO.prCount);
  expect(screen.getByLabelText("CI 최소 시간")).toHaveValue(50);
  expect(screen.getByLabelText("LLM 적중률")).toHaveValue(70);
  expect(screen.getByLabelText("CI 1회 비용")).toHaveValue(null);
  expect(screen.getByLabelText("2번 배치 분할 배치 크기")).toHaveValue(8);
  expect(screen.getByLabelText("3번 LLM 보조 배치 크기")).toHaveValue(8);
  expect(container.querySelectorAll(".policy-instance")).toHaveLength(3);

  fireEvent.click(screen.getByRole("button", { name: /시뮬레이션 시작/ }));
  await waitFor(() => expect(simulation.runExperiment).toHaveBeenCalled());
  expect(simulation.runExperiment.mock.calls[0][0]).toEqual(DEFAULT_SCENARIO);
  expect(simulation.runExperiment.mock.calls[0][1]).toEqual(DEFAULT_POLICIES);
});

test("replays the selected experiment snapshot by policy instance id", async () => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    scale: vi.fn(), clearRect: vi.fn(), beginPath: vi.fn(), arc: vi.fn(), fill: vi.fn(), fillStyle: "",
  } as unknown as CanvasRenderingContext2D);
  const resultScenario = { ...DEFAULT_SCENARIO, name: "완료된 실험", seed: "result-seed", prCount: 123, targetMergeCount: 100 };
  const resultPolicies: PolicyInstance[] = [
    structuredClone(DEFAULT_POLICIES[0]),
    { id: "result-batch", config: { kind: "batchSplit", batchSize: 4, maxWait: 12, splitRatio: 0.25 } },
    structuredClone(DEFAULT_POLICIES[2]),
  ];
  const experiment: ExperimentResult = {
    id: "experiment-1",
    createdAt: "2026-08-31T00:00:00.000Z",
    scenario: resultScenario,
    policies: resultPolicies,
    results: resultPolicies.map((policy) => ({ policy, runs: [], summary: {} })),
    elapsedMs: 10,
  };
  simulation.runExperiment.mockResolvedValueOnce(experiment);
  simulation.replay.mockReturnValueOnce(new Promise(() => undefined));

  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: /시뮬레이션 시작/ }));
  await screen.findByRole("heading", { name: "정책 비교 결과" });

  fireEvent.change(screen.getByLabelText("전체 PR"), { target: { value: "777" } });
  fireEvent.change(screen.getByLabelText("2번 배치 분할 배치 크기"), { target: { value: "16" } });
  fireEvent.click(screen.getAllByRole("button", { name: /실행 재생/ })[1]);

  await waitFor(() => expect(simulation.replay).toHaveBeenCalled());
  expect(simulation.replay.mock.calls[0][0]).toBe(resultScenario);
  expect(simulation.replay.mock.calls[0][1]).toBe(resultPolicies[1]);
  expect(simulation.replay.mock.calls[0][2]).toBe(0);
  expect(screen.getByLabelText("123개 PR 상태 시각화")).toBeInTheDocument();
});
