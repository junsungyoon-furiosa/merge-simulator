import type { DistributionStats, HiddenWorld, PrStatus, RunMetrics, SimEvent } from "./model";

export function describe(values: number[]): DistributionStats {
  if (!values.length) return { count: 0, mean: null, min: null, max: null, variance: null, p50: null, p90: null, p95: null, p99: null };
  const sorted = [...values].sort((a, b) => a - b);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const quantile = (p: number) => {
    const position = (sorted.length - 1) * p;
    const lower = Math.floor(position);
    const upper = Math.ceil(position);
    return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
  };
  return {
    count: values.length,
    mean,
    min: sorted[0],
    max: sorted.at(-1)!,
    variance: values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length,
    p50: quantile(0.5), p90: quantile(0.9), p95: quantile(0.95), p99: quantile(0.99),
  };
}

const terminal = new Set<PrStatus>(["merged", "quarantined"]);

export function calculateMetrics(world: HiddenWorld, events: SimEvent[], endReason: RunMetrics["endReason"], config: { ciCost?: number; llmCost?: number }): RunMetrics {
  const endTime = events.at(-1)?.time ?? 0;
  const merged = world.prs.filter((pr) => pr.status === "merged");
  const defectiveMerged = merged.filter((pr) => pr.individualDefect);
  const quarantined = world.prs.filter((pr) => pr.status === "quarantined");
  const normalMergeTimes = merged.filter((pr) => !pr.individualDefect).map((pr) => pr.mergedAt! - pr.arrivalTime);
  const quarantineTimes = quarantined.map((pr) => pr.quarantinedAt! - pr.arrivalTime);
  const completedInteractions = world.interactions.filter((interaction) => interaction.members.every((id) => world.prs.find((pr) => pr.id === id)?.status === "merged"));
  const ciEvents = events.filter((event) => event.type === "ciCompleted");
  const llmEvents = events.filter((event) => event.type === "llmCompleted");
  const ciBusy = ciEvents.reduce((sum, event) => sum + Number(event.data?.duration ?? 0), 0);
  const llmDurations = llmEvents.map((event) => Number(event.data?.duration ?? 0));
  const firstUnhealthy = events.find((event) => event.type === "masterChanged" && event.data?.healthy === false)?.time;
  const waitTimes: number[] = [];
  const firstCi = new Map<string, number>();
  for (const event of events) if (event.type === "ciStarted") for (const id of event.prIds ?? []) if (!firstCi.has(id)) firstCi.set(id, event.time);
  for (const pr of world.prs) if (firstCi.has(pr.id)) waitTimes.push(firstCi.get(pr.id)! - pr.arrivalTime);

  let queue = 0;
  let maxQueue = 0;
  let weightedQueue = 0;
  let previousTime = 0;
  for (const event of events) {
    weightedQueue += queue * (event.time - previousTime);
    previousTime = event.time;
    if (event.type === "prArrived") queue += event.prIds?.length ?? 0;
    if (event.type === "ciStarted") queue -= event.prIds?.length ?? 0;
    if (event.type === "ciCompleted" && event.data?.observedSuccess === false && (event.prIds?.length ?? 0) > 1) queue += event.prIds?.length ?? 0;
    if (event.type === "llmStarted") queue -= event.prIds?.length ?? 0;
    if (event.type === "llmCompleted") queue += event.prIds?.length ?? 0;
    queue = Math.max(0, queue);
    maxQueue = Math.max(maxQueue, queue);
  }

  const statusCounts = Object.fromEntries(["scheduled", "waiting", "ciWaiting", "ciRunning", "investigating", "suspected", "merged", "quarantined"].map((status) => [status, 0])) as Record<PrStatus, number>;
  world.prs.forEach((pr) => { statusCounts[pr.status] += 1; });
  const totalCauseCount = llmEvents.reduce((sum, event) => sum + Number(event.data?.causeCount ?? 0), 0);
  const coveredCauseCount = llmEvents.reduce((sum, event) => sum + Number(event.data?.coveredCauseCount ?? 0), 0);
  const accusedCount = llmEvents.reduce((sum, event) => sum + Number(event.data?.accusedCount ?? 0), 0);
  const falseAccusedCount = llmEvents.reduce((sum, event) => sum + Number(event.data?.falseAccusedCount ?? 0), 0);
  const ciRuns = ciEvents.length;
  const llmCalls = llmEvents.length;
  const ciSuccesses = ciEvents.filter((event) => event.data?.observedSuccess === true).length;
  const ciFailures = ciEvents.filter((event) => event.data?.observedSuccess === false).length;
  const ciSeen = new Set<string>();
  let ciRetries = 0;
  for (const event of events.filter((candidate) => candidate.type === "ciStarted")) {
    if ((event.prIds ?? []).some((id) => ciSeen.has(id))) ciRetries += 1;
    (event.prIds ?? []).forEach((id) => ciSeen.add(id));
  }
  const ciRunsWhileMasterUnhealthy = events.filter((event) => event.type === "ciStarted" && event.data?.masterHealthyAtStart === false).length;
  const mergesWhileMasterUnhealthy = events.filter((event) => event.type === "masterChanged" && event.data?.previousHealthy === false).reduce((sum, event) => sum + (event.prIds?.length ?? 0), 0);

  return {
    endReason, simulatedTime: endTime, createdPrs: world.prs.filter((pr) => pr.status !== "scheduled").length,
    mergedPrs: merged.length, mergedHealthyPrs: merged.length - defectiveMerged.length, mergedDefectivePrs: defectiveMerged.length,
    defectIngressRate: merged.length ? defectiveMerged.length / merged.length : null,
    harmfulInteractionsMerged: completedInteractions.length,
    harmfulInteractionRate: world.interactions.length ? completedInteractions.length / world.interactions.length : null,
    masterBecameUnhealthy: firstUnhealthy === undefined ? 0 : 1,
    unhealthyMasterDuration: firstUnhealthy === undefined ? 0 : endTime - firstUnhealthy,
    normalMergeTime: describe(normalMergeTimes), quarantineTime: describe(quarantineTimes),
    throughput: endTime ? merged.length / endTime : null,
    normalThroughput: endTime ? (merged.length - defectiveMerged.length) / endTime : null,
    defectiveThroughput: endTime ? defectiveMerged.length / endTime : null,
    ciRuns, ciSuccesses, ciFailures,
    ciInvalidations: events.filter((event) => event.type === "ciInvalidated").length, ciRetries,
    ciUtilization: endTime ? Math.min(1, ciBusy / endTime) : null, ciIdleTime: Math.max(0, endTime - ciBusy),
    llmCalls,
    llmSuccesses: llmEvents.filter((event) => event.data?.grade === "success").length,
    llmPartialFailures: llmEvents.filter((event) => event.data?.grade === "partialFailure").length,
    llmFailures: llmEvents.filter((event) => event.data?.grade === "failure").length,
    llmCoverage: totalCauseCount ? coveredCauseCount / totalCauseCount : null,
    llmFalseAccusationRate: accusedCount ? falseAccusedCount / accusedCount : null,
    llmDuration: describe(llmDurations),
    quarantinedPrs: quarantined.length,
    falseQuarantines: quarantined.filter((pr) => !pr.individualDefect).length,
    ciRunsWhileMasterUnhealthy, mergesWhileMasterUnhealthy,
    averageQueueLength: endTime ? weightedQueue / endTime : 0, maxQueueLength: maxQueue,
    averageWaitTime: describe(waitTimes).mean, p95WaitTime: describe(waitTimes).p95,
    ciCost: config.ciCost === undefined ? null : ciRuns * config.ciCost,
    llmCost: config.llmCost === undefined ? null : llmCalls * config.llmCost,
    finalStates: statusCounts,
  };
}

export function allTerminal(world: HiddenWorld): boolean { return world.prs.every((pr) => pr.status === "scheduled" || terminal.has(pr.status)); }
