import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import type { PrStatus, SimEvent } from "../sim/model";
import { RunReplay } from "./RunReplay";

const statuses: PrStatus[] = ["scheduled", "waiting", "ciWaiting", "ciRunning", "investigating", "notSuspected", "suspected", "merged", "quarantined"];

test("renders replay legend status names in Korean", () => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    scale: vi.fn(),
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    fillStyle: "",
  } as unknown as CanvasRenderingContext2D);
  const events: SimEvent[] = statuses.map((status, index) => ({
    seq: index,
    time: index === statuses.length - 1 ? 1590 : index,
    type: "prStateChanged",
    prIds: [`pr-${index + 1}`],
    to: status,
  }));

  render(<RunReplay events={events} totalPrs={statuses.length} loading={false} onClose={() => undefined} />);
  fireEvent.click(screen.getByRole("button", { name: "즉시 완료" }));
  expect(screen.getByText("T+ 26시간 30분")).toBeInTheDocument();

  for (const label of ["도착 예정", "대기", "CI 대기", "CI 실행", "조사", "비의심", "의심", "머지", "격리"]) {
    expect(screen.getByText(`${label} 1`)).toBeInTheDocument();
  }
});
