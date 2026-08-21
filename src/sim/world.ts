import type { HiddenWorld, PrId, ScenarioConfig } from "./model";
import { deriveSeed, Random } from "./random";

function weightedSize(weights: Record<number, number>, maxSize: number, rng: Random): number {
  const entries = Object.entries(weights)
    .map(([size, weight]) => [Number(size), weight] as const)
    .filter(([size, weight]) => size >= 2 && size <= maxSize && weight > 0);
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  if (!entries.length || total <= 0) return 2;
  let cursor = rng.next() * total;
  for (const [size, weight] of entries) {
    cursor -= weight;
    if (cursor <= 0) return size;
  }
  return entries.at(-1)![0];
}

function chooseMembers(prCount: number, size: number, rng: Random): PrId[] {
  const indexes = new Set<number>();
  while (indexes.size < Math.min(size, prCount)) indexes.add(rng.integer(0, prCount - 1));
  return [...indexes].sort((a, b) => a - b).map((index) => `pr-${index + 1}`);
}

export function generateWorld(config: ScenarioConfig, repetition: number): HiddenWorld {
  const rng = new Random(deriveSeed(config.seed, repetition, "world"));
  let time = 0;
  const prs = Array.from({ length: config.prCount }, (_, index) => {
    time += index === 0 ? 0 : rng.sample(config.arrival);
    return {
      id: `pr-${index + 1}`,
      index,
      arrivalTime: time,
      status: "scheduled" as const,
      individualDefect: rng.bool(config.individualDefectProbability),
    };
  });
  const interactionCount = rng.poisson((config.prCount / 100) * config.interactionDefects.setsPerHundredPrs);
  const interactions: HiddenWorld["interactions"] = [];
  const seen = new Set<string>();
  for (let attempt = 0; interactions.length < interactionCount && attempt < interactionCount * 20 + 20; attempt += 1) {
    const size = weightedSize(config.interactionDefects.sizeWeights, config.interactionDefects.maxSize, rng);
    const members = chooseMembers(config.prCount, size, rng);
    const key = members.join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    interactions.push({ id: `interaction-${interactions.length + 1}`, members });
  }
  return { prs, interactions };
}
