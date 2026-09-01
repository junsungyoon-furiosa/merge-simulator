import { expect, test } from "vitest";
import { runExperiment } from "../sim/experiment";
import { DEFAULT_SCENARIO } from "../sim/model";
import { DEFAULT_POLICIES } from "../sim/policyRegistry";

test("maximum planned experiment completes within the interactive budget", () => {
  const result = runExperiment({ ...DEFAULT_SCENARIO, prCount: 1000, targetMergeCount: 800, repetitions: 100 }, DEFAULT_POLICIES);
  expect(result.elapsedMs).toBeLessThan(30_000);
}, 35_000);
