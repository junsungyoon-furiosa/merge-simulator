import { expect, test } from "vitest";
import { runExperiment } from "../sim/experiment";
import { DEFAULT_POLICIES, DEFAULT_SCENARIO } from "../sim/model";

test("maximum planned experiment completes within the interactive budget", () => {
  const started = performance.now();
  const result = runExperiment({ ...DEFAULT_SCENARIO, prCount: 1000, targetMergeCount: 800, repetitions: 100 }, DEFAULT_POLICIES);
  const elapsed = performance.now() - started;
  expect(result.results).toHaveLength(3);
  expect(elapsed).toBeLessThan(30_000);
}, 35_000);
