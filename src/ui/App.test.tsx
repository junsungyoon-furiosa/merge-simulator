import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { App } from "./App";
afterEach(cleanup);

class WorkerMock {
  addEventListener = vi.fn(); removeEventListener = vi.fn(); postMessage = vi.fn(); terminate = vi.fn();
}

vi.stubGlobal("Worker", WorkerMock);
vi.mock("../storage/database", () => ({ loadScenario: vi.fn().mockResolvedValue(undefined), saveScenario: vi.fn().mockResolvedValue(undefined), saveExperiment: vi.fn().mockResolvedValue(undefined) }));

test("renders the simulator's primary action and three policies", () => {
  render(<App />);
  expect(screen.getByRole("button", { name: /3개 정책 비교 실행/ })).toBeInTheDocument();
  expect(screen.getAllByText(/순차 CI/).length).toBeGreaterThan(0);
  expect(screen.getAllByText(/배치 분할/).length).toBeGreaterThan(0);
  expect(screen.getAllByText(/LLM 보조/).length).toBeGreaterThan(0);
});

test("provides help tooltips for every scenario field", () => {
  render(<App />);
  expect(screen.getAllByRole("button", { name: "도움말" })).toHaveLength(19);
  expect(screen.getByText(/비정상인 후보 master를 CI가 성공으로 잘못 판정/)).toHaveAttribute("role", "tooltip");
});
