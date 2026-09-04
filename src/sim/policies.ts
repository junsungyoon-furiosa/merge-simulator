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
interface PendingBatch {
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

type ConfigurableBatchConfig = Extract<PolicyConfig, { kind: "batchSplit" | "bors" | "llmAssisted" }>;

class ConfigurableBatchPolicy implements MergePolicy {
  readonly config: ConfigurableBatchConfig;
  private pending: PendingBatch[] = [];
  private pendingRecoveryBatches: PrId[][] = [];
  private pendingLlm: Array<{ batchId: BatchId; prIds: PrId[] }> = [];
  private nextOrder = 0;

  constructor(config: ConfigurableBatchConfig) { this.config = config; }

  onArrival(prId: PrId, arrivalTime: number): void {
    const openFresh = [...this.pending].reverse().find((batch) =>
      batch.origin === "fresh" && batch.prIds.length < this.config.maxBatchSize);
    if (openFresh) {
      openFresh.prIds.push(prId);
      return;
    }
    this.pending.push(this.makeBatch([prId], arrivalTime, "fresh"));
  }

  onBatchFailed(batchId: BatchId, prIds: PrId[], allowLlm: boolean): void {
    if (prIds.length <= 1) return;
    if (allowLlm && this.config.failureRecovery.mode === "llmThenSplit") {
      this.pendingLlm.push({ batchId, prIds });
      return;
    }
    const cut = Math.max(1, Math.min(prIds.length - 1, Math.round(prIds.length * this.config.splitRatio)));
    this.pendingRecoveryBatches.push(prIds.slice(0, cut), prIds.slice(cut));
  }

  onLlmCompleted(batchId: BatchId, prIds: PrId[], suspects: PrId[]): void {
    this.pendingLlm = this.pendingLlm.filter((item) => item.batchId !== batchId);
    const suspectSet = new Set(suspects);
    const cleared = prIds.filter((id) => !suspectSet.has(id));
    if (cleared.length) this.pendingRecoveryBatches.push(cleared);
    this.pendingRecoveryBatches.push(...suspects.map((id) => [id]));
  }

  decide(observation: PolicyObservation): PolicyAction[] {
    this.materializeSplitBatches(observation.now);
    const actions: PolicyAction[] = this.pendingLlm.map(({ batchId }) => ({ type: "callLlm", failedBatchId: batchId }));
    this.pendingLlm = [];
    if (!observation.ciIdle || !this.pending.length) return actions;

    const ready = this.pending
      .map((batch, index) => ({ batch, index }))
      .filter(({ batch }) => this.isReady(batch, observation));

    if (!ready.length) {
      return [...actions, { type: "waitUntil", time: Math.min(...this.pending.map((batch) => batch.readyAt)) }];
    }

    const readySplits = ready.filter(({ batch }) => batch.origin === "split");
    const candidates = this.config.splitBatchScheduling === "beforeFresh" && readySplits.length ? readySplits : ready;
    const chosen = candidates.reduce((first, candidate) =>
      candidate.batch.createdAt < first.batch.createdAt ||
      (candidate.batch.createdAt === first.batch.createdAt && candidate.batch.order < first.batch.order)
        ? candidate : first);
    const [{ prIds }] = this.pending.splice(chosen.index, 1);
    const allowLlm = chosen.batch.origin === "fresh" && this.config.failureRecovery.mode === "llmThenSplit";
    return [...actions, { type: "submitCi", prIds, allowLlm }];
  }

  hasPendingWork(): boolean { return this.pending.length > 0 || this.pendingRecoveryBatches.length > 0 || this.pendingLlm.length > 0; }

  private isReady(batch: PendingBatch, observation: PolicyObservation): boolean {
    if (batch.origin === "split") return batch.readyAt <= observation.now;
    if (observation.allArrived || batch.readyAt <= observation.now) return true;
    return this.config.batchTiming.mode === "sizeOrTimeout" && batch.prIds.length >= this.config.maxBatchSize;
  }

  private materializeSplitBatches(now: number): void {
    if (!this.pendingRecoveryBatches.length) return;
    this.pending.push(...this.pendingRecoveryBatches.map((prIds) => this.makeBatch(prIds, now, "split")));
    this.pendingRecoveryBatches = [];
  }

  private makeBatch(prIds: PrId[], createdAt: number, origin: PendingBatch["origin"]): PendingBatch {
    const delay = origin === "fresh" ? this.config.batchTiming.minutes : this.config.splitBatchDelayMinutes;
    return { prIds, createdAt, readyAt: createdAt + delay, origin, order: this.nextOrder++ };
  }
}

export const createSequentialPolicy = (config: Extract<PolicyConfig, { kind: "sequential" }>): MergePolicy => new SequentialPolicy(config);
export const createBatchSplitPolicy = (config: Extract<PolicyConfig, { kind: "batchSplit" }>): MergePolicy => new ConfigurableBatchPolicy(config);
export const createBorsPolicy = (config: Extract<PolicyConfig, { kind: "bors" }>): MergePolicy => new ConfigurableBatchPolicy(config);
export const createLlmAssistedPolicy = (config: Extract<PolicyConfig, { kind: "llmAssisted" }>): MergePolicy => new ConfigurableBatchPolicy(config);
