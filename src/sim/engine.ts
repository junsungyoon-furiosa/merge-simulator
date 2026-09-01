import { EventQueue } from "./eventQueue";
import { calculateMetrics } from "./metrics";
import type { BatchId, EndReason, FailedBatchRecord, PolicyInstance, PrId, PrStatus, RunResult, ScenarioConfig, SimEvent } from "./model";
import { createPolicy } from "./policyRegistry";
import { deriveSeed, Random } from "./random";
import { generateWorld } from "./world";

type InternalEvent =
  | { kind: "arrival"; prId: PrId }
  | { kind: "wake"; at: number }
  | { kind: "ciComplete"; batchId: BatchId; prIds: PrId[]; masterVersion: number; duration: number; actualHealthy: boolean; observedSuccess: boolean; newCauseIds: string[]; actionableCauses: PrId[][]; allowLlm: boolean }
  | { kind: "llmComplete"; batchId: BatchId; prIds: PrId[]; duration: number; suspects: PrId[]; actionableCauses: PrId[][] };

const PRIORITY = { complete: 0, arrival: 1, wake: 2 } as const;

export function runSimulation(config: ScenarioConfig, policyInstance: PolicyInstance, repetition = 0): RunResult {
  const world = generateWorld(config, repetition);
  const ciDurationRng = new Random(deriveSeed(config.seed, repetition, "ciDuration"));
  const ciOutcomeRng = new Random(deriveSeed(config.seed, repetition, "ciOutcome"));
  const llmDurationRng = new Random(deriveSeed(config.seed, repetition, "llmDuration"));
  const llmOutcomeRng = new Random(deriveSeed(config.seed, repetition, "llmOutcome"));
  const policy = createPolicy(policyInstance.config);
  const queue = new EventQueue<InternalEvent>();
  const events: SimEvent[] = [];
  const merged = new Set<PrId>();
  const activeCauses = new Set<string>();
  const failedBatches = new Map<BatchId, FailedBatchRecord & { actionableCauses: PrId[][] }>();
  const llmInFlight = new Set<BatchId>();
  let order = 0;
  let seq = 0;
  let now = 0;
  let ciBusy = false;
  let masterVersion = 0;
  let masterHealthy = true;
  let batchCounter = 0;
  let wakeAt: number | undefined;
  let arrivedCount = 0;
  let endReason: EndReason | undefined;

  const emit = (type: SimEvent["type"], details: Omit<SimEvent, "seq" | "time" | "type"> = {}) => {
    events.push({ seq: seq++, time: now, type, ...details });
  };
  const schedule = (time: number, priority: number, payload: InternalEvent) => queue.push({ time, priority, order: order++, payload });
  world.prs.forEach((pr) => schedule(pr.arrivalTime, PRIORITY.arrival, { kind: "arrival", prId: pr.id }));
  const prById = new Map(world.prs.map((pr) => [pr.id, pr]));

  const transition = (ids: PrId[], to: PrStatus) => {
    for (const id of ids) {
      const pr = prById.get(id)!;
      const from = pr.status;
      pr.status = to;
      emit("prStateChanged", { prIds: [id], from, to });
    }
  };

  const actionableFor = (prIds: PrId[]): { causes: PrId[][]; newCauseIds: string[]; actualHealthy: boolean } => {
    const batch = new Set(prIds);
    const candidate = new Set([...merged, ...prIds]);
    const causes: PrId[][] = [];
    const newCauseIds: string[] = [];
    for (const id of prIds) {
      if (prById.get(id)!.individualDefect) { causes.push([id]); newCauseIds.push(`individual:${id}`); }
    }
    for (const interaction of world.interactions) {
      if (!activeCauses.has(interaction.id) && interaction.members.every((id) => candidate.has(id))) {
        const membersInBatch = interaction.members.filter((id) => batch.has(id));
        if (membersInBatch.length) causes.push(membersInBatch);
        newCauseIds.push(interaction.id);
      }
    }
    return { causes, newCauseIds, actualHealthy: masterHealthy && newCauseIds.length === 0 };
  };

  const startCi = (prIds: PrId[], allowLlm: boolean) => {
    if (ciBusy || !prIds.length) throw new Error("CI is not available");
    if (new Set(prIds).size !== prIds.length || prIds.some((id) => !["waiting", "investigating", "suspected"].includes(prById.get(id)?.status ?? ""))) throw new Error("Policy selected unavailable PRs");
    ciBusy = true;
    const batchId = `batch-${++batchCounter}`;
    transition(prIds, "ciRunning");
    const truth = actionableFor(prIds);
    const observedSuccess = truth.actualHealthy ? !ciOutcomeRng.bool(config.ci.falsePositiveRate) : ciOutcomeRng.bool(config.ci.falseNegativeRate);
    const duration = ciDurationRng.sample(config.ci.duration);
    emit("policyDecided", { prIds, batchId, data: { action: "submitCi" } });
    emit("ciStarted", { prIds, batchId, data: { masterVersion, masterHealthyAtStart: masterHealthy, duration, actualHealthy: truth.actualHealthy } });
    schedule(now + duration, PRIORITY.complete, { kind: "ciComplete", batchId, prIds, masterVersion, duration, actualHealthy: truth.actualHealthy, observedSuccess, newCauseIds: truth.newCauseIds, actionableCauses: truth.causes, allowLlm });
  };

  const startLlm = (record: FailedBatchRecord & { actionableCauses: PrId[][] }) => {
    if (record.llmRequested || llmInFlight.has(record.id)) return;
    record.llmRequested = true;
    llmInFlight.add(record.id);
    const culpritSet = new Set(record.actionableCauses.flat());
    const suspects = record.prIds.filter((id) => culpritSet.has(id) ? llmOutcomeRng.bool(config.llm.culpritHitRate) : llmOutcomeRng.bool(config.llm.innocentFalseAccusationRate));
    const duration = llmDurationRng.sample(config.llm.duration);
    emit("policyDecided", { batchId: record.id, data: { action: "callLlm" } });
    emit("llmStarted", { batchId: record.id, prIds: record.prIds, data: { duration } });
    schedule(now + duration, PRIORITY.complete, { kind: "llmComplete", batchId: record.id, prIds: record.prIds, duration, suspects, actionableCauses: record.actionableCauses });
  };

  const dispatch = () => {
    const actions = policy.decide({ now, ciIdle: !ciBusy, allArrived: arrivedCount === world.prs.length });
    const ciActions = actions.filter((action) => action.type === "submitCi");
    if (ciActions.length > 1) throw new Error("Policy submitted multiple CI batches");
    for (const action of actions) {
      if (action.type === "submitCi") startCi(action.prIds, action.allowLlm);
      if (action.type === "callLlm") {
        const record = failedBatches.get(action.failedBatchId);
        if (!record) throw new Error("Policy requested an unknown failed batch");
        startLlm(record);
      }
      if (action.type === "waitUntil" && action.time > now && (wakeAt === undefined || action.time < wakeAt)) {
        wakeAt = action.time;
        schedule(action.time, PRIORITY.wake, { kind: "wake", at: action.time });
        emit("policyDecided", { data: { action: "waitUntil", until: action.time } });
      }
    }
  };

  try {
    let guard = 0;
    while (!endReason && guard++ < 2_000_000) {
      const scheduled = queue.pop();
      if (!scheduled) {
        endReason = world.prs.every((pr) => pr.status === "scheduled" || pr.status === "merged" || pr.status === "quarantined") ? "exhausted" : "stalled";
        break;
      }
      now = scheduled.time;
      const event = scheduled.payload;
      if (event.kind === "arrival") {
        const pr = prById.get(event.prId)!;
        if (pr.status !== "scheduled") continue;
        arrivedCount += 1;
        pr.status = "waiting";
        emit("prArrived", { prIds: [pr.id], data: { arrivalTime: now } });
        policy.onArrival(pr.id, now);
      } else if (event.kind === "wake") {
        if (wakeAt !== event.at) continue;
        wakeAt = undefined;
      } else if (event.kind === "ciComplete") {
        ciBusy = false;
        if (event.masterVersion !== masterVersion) {
          transition(event.prIds, "investigating");
          emit("ciInvalidated", { batchId: event.batchId, prIds: event.prIds, data: { duration: event.duration } });
          policy.onBatchFailed(event.batchId, event.prIds, false);
        } else {
          emit("ciCompleted", { batchId: event.batchId, prIds: event.prIds, data: { duration: event.duration, actualHealthy: event.actualHealthy, observedSuccess: event.observedSuccess } });
          if (event.observedSuccess) {
            transition(event.prIds, "merged");
            event.prIds.forEach((id) => { const pr = prById.get(id)!; pr.mergedAt = now; merged.add(id); });
            const wasHealthy = masterHealthy;
            event.newCauseIds.forEach((id) => activeCauses.add(id));
            masterHealthy = masterHealthy && event.actualHealthy;
            masterVersion += 1;
            emit("masterChanged", { prIds: event.prIds, data: { version: masterVersion, healthy: masterHealthy, previousHealthy: wasHealthy } });
          } else if (event.prIds.length === 1) {
            transition(event.prIds, "quarantined");
            prById.get(event.prIds[0])!.quarantinedAt = now;
          } else {
            transition(event.prIds, "investigating");
            const record = { id: event.batchId, prIds: event.prIds, hint: `hint:${event.batchId}`, llmRequested: false, llmCompleted: false, allowLlm: event.allowLlm, actionableCauses: event.actionableCauses };
            failedBatches.set(event.batchId, record);
            policy.onBatchFailed(event.batchId, event.prIds, event.allowLlm);
          }
        }
      } else if (event.kind === "llmComplete") {
        llmInFlight.delete(event.batchId);
        const record = failedBatches.get(event.batchId);
        if (!record) continue;
        record.llmCompleted = true;
        record.suspects = event.suspects;
        const suspectSet = new Set(event.suspects);
        const covered = event.actionableCauses.filter((cause) => cause.some((id) => suspectSet.has(id))).length;
        const causeCount = event.actionableCauses.length;
        const culpritSet = new Set(event.actionableCauses.flat());
        const falseAccused = event.suspects.filter((id) => !culpritSet.has(id)).length;
        const grade = causeCount === 0 ? (event.suspects.length ? "failure" : "success") : covered === causeCount ? "success" : covered > 0 ? "partialFailure" : "failure";
        transition(event.prIds, "investigating");
        transition(event.suspects, "suspected");
        emit("llmCompleted", { batchId: event.batchId, prIds: event.prIds, data: { duration: event.duration, suspects: event.suspects, causeCount, coveredCauseCount: covered, accusedCount: event.suspects.length, falseAccusedCount: falseAccused, grade } });
        policy.onLlmCompleted(event.batchId, event.prIds, event.suspects);
      }

      if (merged.size >= config.targetMergeCount) endReason = "targetReached";
      if (!endReason) dispatch();
      if (!endReason && arrivedCount === world.prs.length && !ciBusy && llmInFlight.size === 0 && !policy.hasPendingWork()) {
        endReason = world.prs.every((pr) => pr.status === "merged" || pr.status === "quarantined") ? "exhausted" : "stalled";
      }
    }
    if (!endReason) endReason = "policyError";
  } catch (error) {
    endReason = "policyError";
    emit("policyDecided", { data: { error: error instanceof Error ? error.message : String(error) } });
  }
  emit("runEnded", { data: { reason: endReason } });
  return {
    policy: policyInstance, repetition, seed: deriveSeed(config.seed, repetition), events,
    metrics: calculateMetrics(world, events, endReason, { ciCost: config.ci.costPerRun, llmCost: config.llm.costPerCall }),
  };
}
