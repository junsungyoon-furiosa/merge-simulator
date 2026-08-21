import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { App } from "./App";

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
