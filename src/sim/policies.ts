import type { BatchId, PolicyConfig, PrId } from "./model";

export type PolicyAction =
  | { type: "submitCi"; prIds: PrId[]; allowLlm: boolean }
  | { type: "callLlm"; failedBatchId: BatchId }
  | { type: "waitUntil"; time: number };

export interface PolicyObservation {
  now: number;
  ciIdle: boolean;
  allArrived: boolean;
}

export interface MergePolicy {
  readonly config: PolicyConfig;
  onArrival(prId: PrId, arrivalTime: number): void;
  onBatchFailed(batchId: BatchId, prIds: PrId[], allowLlm: boolean): void;
  onLlmCompleted(batchId: BatchId, prIds: PrId[], suspects: PrId[]): void;
  decide(observation: PolicyObservation): PolicyAction[];
  hasPendingWork(): boolean;
}

interface Task { prIds: PrId[]; allowLlm: boolean }
interface Arrival { id: PrId; time: number }
interface BorsBatch {
  prIds: PrId[];
  createdAt: number;
  readyAt: number;
  origin: "fresh" | "split";
  order: number;
}

class BasePolicy implements MergePolicy {
  readonly config: PolicyConfig;
  protected fresh: Arrival[] = [];
  protected priority: Task[] = [];
  protected pendingLlm: Array<{ batchId: BatchId; prIds: PrId[] }> = [];

  constructor(config: PolicyConfig) { this.config = config; }

  onArrival(prId: PrId, arrivalTime: number): void { this.fresh.push({ id: prId, time: arrivalTime }); }

  onBatchFailed(_batchId: BatchId, prIds: PrId[], _allowLlm: boolean): void { this.enqueueSplit(prIds); }

  onLlmCompleted(_batchId: BatchId, _prIds: PrId[], _suspects: PrId[]): void { /* only LLM policy uses this */ }

  decide(observation: PolicyObservation): PolicyAction[] {
    if (!observation.ciIdle) return [];
    const priority = this.priority.shift();
    if (priority) return [{ type: "submitCi", ...priority }];
    return this.freshAction(observation);
  }

  hasPendingWork(): boolean { return this.fresh.length > 0 || this.priority.length > 0 || this.pendingLlm.length > 0; }

  protected freshAction(_observation: PolicyObservation): PolicyAction[] { return []; }

  protected enqueueSplit(prIds: PrId[], ratio = 0.5): void {
    if (prIds.length <= 1) return;
    const cut = Math.max(1, Math.min(prIds.length - 1, Math.round(prIds.length * ratio)));
    this.priority.unshift(
      { prIds: prIds.slice(cut), allowLlm: false },
      { prIds: prIds.slice(0, cut), allowLlm: false },
    );
  }
}

class SequentialPolicy extends BasePolicy {
  protected freshAction(): PolicyAction[] {
    const next = this.fresh.shift();
    return next ? [{ type: "submitCi", prIds: [next.id], allowLlm: false }] : [];
  }
}

class BatchSplitPolicy extends BasePolicy {
  declare readonly config: Extract<PolicyConfig, { kind: "batchSplit" }>;

  constructor(config: Extract<PolicyConfig, { kind: "batchSplit" }>) { super(config); this.config = config; }

  onBatchFailed(_batchId: BatchId, prIds: PrId[]): void { this.enqueueSplit(prIds, this.config.splitRatio); }

  protected freshAction(observation: PolicyObservation): PolicyAction[] {
    if (!this.fresh.length) return [];
    const due = observation.now >= this.fresh[0].time + this.config.maxWait;
    if (this.fresh.length >= this.config.batchSize || due || observation.allArrived) {
      const chosen = this.fresh.splice(0, this.config.batchSize).map((item) => item.id);
      return [{ type: "submitCi", prIds: chosen, allowLlm: false }];
    }
    return [{ type: "waitUntil", time: this.fresh[0].time + this.config.maxWait }];
  }
}

class BorsPolicy implements MergePolicy {
  declare readonly config: Extract<PolicyConfig, { kind: "bors" }>;
  private pending: BorsBatch[] = [];
  private failedToSplit: PrId[][] = [];
  private nextOrder = 0;

  constructor(config: Extract<PolicyConfig, { kind: "bors" }>) { this.config = config; }

  onArrival(prId: PrId, arrivalTime: number): void {
    const openFresh = [...this.pending].reverse().find((batch) =>
      batch.origin === "fresh" && batch.prIds.length < this.config.maxBatchSize);
    if (openFresh) {
      openFresh.prIds.push(prId);
      return;
    }
    this.pending.push(this.makeBatch([prId], arrivalTime, "fresh"));
  }

  onBatchFailed(_batchId: BatchId, prIds: PrId[]): void {
    if (prIds.length <= 1) return;
    const cut = Math.ceil(prIds.length / 2);
    this.failedToSplit.push(prIds.slice(0, cut), prIds.slice(cut));
  }

  onLlmCompleted(_batchId: BatchId, _prIds: PrId[], _suspects: PrId[]): void { /* bors does not use LLM */ }

  decide(observation: PolicyObservation): PolicyAction[] {
    this.materializeSplitBatches(observation.now);
    if (!observation.ciIdle || !this.pending.length) return [];

    const ready = this.pending
      .map((batch, index) => ({ batch, index }))
      .filter(({ batch }) =>
        batch.readyAt <= observation.now || (observation.allArrived && batch.origin === "fresh"));

    if (!ready.length) {
      return [{ type: "waitUntil", time: Math.min(...this.pending.map((batch) => batch.readyAt)) }];
    }

    const readySplits = ready.filter(({ batch }) => batch.origin === "split");
    const candidates = this.config.splitBatchScheduling === "beforeFresh" && readySplits.length ? readySplits : ready;
    const chosen = candidates.reduce((first, candidate) =>
      candidate.batch.createdAt < first.batch.createdAt ||
      (candidate.batch.createdAt === first.batch.createdAt && candidate.batch.order < first.batch.order)
        ? candidate : first);
    const [{ prIds }] = this.pending.splice(chosen.index, 1);
    return [{ type: "submitCi", prIds, allowLlm: false }];
  }

  hasPendingWork(): boolean { return this.pending.length > 0 || this.failedToSplit.length > 0; }

  private materializeSplitBatches(now: number): void {
    if (!this.failedToSplit.length) return;
    this.pending.push(...this.failedToSplit.map((prIds) => this.makeBatch(prIds, now, "split")));
    this.failedToSplit = [];
  }

  private makeBatch(prIds: PrId[], createdAt: number, origin: BorsBatch["origin"]): BorsBatch {
    return { prIds, createdAt, readyAt: createdAt + this.config.batchDelay, origin, order: this.nextOrder++ };
  }
}

class LlmAssistedPolicy extends BasePolicy {
  declare readonly config: Extract<PolicyConfig, { kind: "llmAssisted" }>;

  constructor(config: Extract<PolicyConfig, { kind: "llmAssisted" }>) { super(config); this.config = config; }

  onBatchFailed(batchId: BatchId, prIds: PrId[], allowLlm: boolean): void {
    if (allowLlm) this.pendingLlm.push({ batchId, prIds });
    else this.enqueueSplit(prIds);
  }

  onLlmCompleted(batchId: BatchId, prIds: PrId[], suspects: PrId[]): void {
    this.pendingLlm = this.pendingLlm.filter((item) => item.batchId !== batchId);
    const suspectSet = new Set(suspects);
    const cleared = prIds.filter((id) => !suspectSet.has(id));
    const tasks: Task[] = [];
    if (cleared.length) tasks.push({ prIds: cleared, allowLlm: false });
    tasks.push(...suspects.map((id) => ({ prIds: [id], allowLlm: false })));
    this.priority.push(...tasks);
  }

  decide(observation: PolicyObservation): PolicyAction[] {
    const actions: PolicyAction[] = this.pendingLlm.map(({ batchId }) => ({ type: "callLlm", failedBatchId: batchId }));
    this.pendingLlm = [];
    if (!observation.ciIdle) return actions;
    const priority = this.priority.shift();
    if (priority) return [...actions, { type: "submitCi", ...priority }];
    return [...actions, ...this.freshAction(observation)];
  }

  protected freshAction(observation: PolicyObservation): PolicyAction[] {
    if (!this.fresh.length) return [];
    const due = observation.now >= this.fresh[0].time + this.config.maxWait;
    if (this.fresh.length >= this.config.batchSize || due || observation.allArrived) {
      return [{ type: "submitCi", prIds: this.fresh.splice(0, this.config.batchSize).map((item) => item.id), allowLlm: true }];
    }
    return [{ type: "waitUntil", time: this.fresh[0].time + this.config.maxWait }];
  }
}

export const createSequentialPolicy = (config: Extract<PolicyConfig, { kind: "sequential" }>): MergePolicy => new SequentialPolicy(config);
export const createBatchSplitPolicy = (config: Extract<PolicyConfig, { kind: "batchSplit" }>): MergePolicy => new BatchSplitPolicy(config);
export const createBorsPolicy = (config: Extract<PolicyConfig, { kind: "bors" }>): MergePolicy => new BorsPolicy(config);
export const createLlmAssistedPolicy = (config: Extract<PolicyConfig, { kind: "llmAssisted" }>): MergePolicy => new LlmAssistedPolicy(config);
