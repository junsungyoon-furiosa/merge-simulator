import { describe, expect, test } from "vitest";
import { DEFAULT_SCENARIO } from "../sim/model";
import { Random } from "../sim/random";
import { generateWorld } from "../sim/world";

describe("deterministic random world", () => {
  test("same seed creates the same values", () => {
    const a = new Random("same");
    const b = new Random("same");
    expect(Array.from({ length: 20 }, () => a.next())).toEqual(Array.from({ length: 20 }, () => b.next()));
  });

  test("world respects bounds and is reproducible", () => {
    const config = { ...DEFAULT_SCENARIO, prCount: 100 };
    const a = generateWorld(config, 2);
    const b = generateWorld(config, 2);
    expect(a).toEqual(b);
    expect(a.prs).toHaveLength(100);
    expect(a.interactions.every((item) => new Set(item.members).size === item.members.length && item.members.length >= 2 && item.members.length <= 4)).toBe(true);
  });
});
