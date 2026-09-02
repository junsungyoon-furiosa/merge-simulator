import type { DailyArrivalProfile, HiddenWorld, PrId, ScenarioConfig } from "./model";
import { deriveSeed, Random } from "./random";

const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;

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

export function generateDailyArrivalTimes(arrival: DailyArrivalProfile, prCount: number, rng: Random): number[] {
  const totalWeight = arrival.hourlyWeights.reduce((sum, weight) => sum + weight, 0);
  if (arrival.meanPerDay < 0.1 || arrival.hourlyWeights.length !== HOURS_PER_DAY || arrival.hourlyWeights.some((weight) => weight < 0) || !(totalWeight > 0)) {
    throw new RangeError("Daily arrival profile must have a positive mean and 24 non-empty hourly weights");
  }

  const arrivals: number[] = [];
  for (let absoluteHour = 0; arrivals.length < prCount; absoluteHour += 1) {
    const hourOfDay = absoluteHour % HOURS_PER_DAY;
    const expectedCount = arrival.meanPerDay * arrival.hourlyWeights[hourOfDay] / totalWeight;
    const offsets = Array.from({ length: rng.poisson(expectedCount) }, () => rng.next() * MINUTES_PER_HOUR)
      .sort((left, right) => left - right);
    const hourStart = absoluteHour * MINUTES_PER_HOUR;
    for (const offset of offsets) {
      arrivals.push(hourStart + offset);
      if (arrivals.length === prCount) break;
    }
  }
  return arrivals;
}

export function generateWorld(config: ScenarioConfig, repetition: number): HiddenWorld {
  const arrivalRng = new Random(deriveSeed(config.seed, repetition, "world", "arrivals"));
  const defectRng = new Random(deriveSeed(config.seed, repetition, "world", "individual-defects"));
  const interactionRng = new Random(deriveSeed(config.seed, repetition, "world", "interactions"));
  const arrivalTimes = generateDailyArrivalTimes(config.arrival, config.prCount, arrivalRng);
  const prs = arrivalTimes.map((arrivalTime, index) => ({
    id: `pr-${index + 1}`,
    index,
    arrivalTime,
    status: "scheduled" as const,
    individualDefect: defectRng.bool(config.individualDefectProbability),
  }));
  const interactionCount = interactionRng.poisson((config.prCount / 100) * config.interactionDefects.setsPerHundredPrs);
  const interactions: HiddenWorld["interactions"] = [];
  const seen = new Set<string>();
  for (let attempt = 0; interactions.length < interactionCount && attempt < interactionCount * 20 + 20; attempt += 1) {
    const size = weightedSize(config.interactionDefects.sizeWeights, config.interactionDefects.maxSize, interactionRng);
    const members = chooseMembers(config.prCount, size, interactionRng);
    const key = members.join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    interactions.push({ id: `interaction-${interactions.length + 1}`, members });
  }
  return { prs, interactions };
}
