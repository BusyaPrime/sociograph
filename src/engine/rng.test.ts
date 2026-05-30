import {
  nextRandom,
  deriveSeed,
  nextInt,
  nextFloat,
  pick,
  weightedPick,
  shuffle,
} from "@engine/rng";

describe("deriveSeed", () => {
  it("passes numbers through as int32", () => {
    expect(deriveSeed(42)).toBe(42);
    expect(deriveSeed(0)).toBe(0);
  });

  it("folds strings via FNV-1a (pinned golden values)", () => {
    expect(deriveSeed("sociograph-test")).toBe(1511210751);
    expect(deriveSeed("42")).toBe(-2015132285);
  });

  it("does not collide a number with its string form", () => {
    expect(deriveSeed(42)).not.toBe(deriveSeed("42"));
  });

  it("is referentially stable", () => {
    expect(deriveSeed("abc")).toBe(deriveSeed("abc"));
  });
});

describe("nextRandom determinism + golden vector", () => {
  it("pins nextRandom(0) (guards the algorithm constants)", () => {
    expect(Number(nextRandom(0).value.toFixed(8))).toBe(0.26642921);
  });

  it("produces a byte-identical sequence for a fixed seed", () => {
    const take = (n: number, seed: number): number[] => {
      const out: number[] = [];
      let s = seed;
      for (let i = 0; i < n; i++) {
        const d = nextRandom(s);
        out.push(Number(d.value.toFixed(6)));
        s = d.state;
      }
      return out;
    };
    expect(take(5, deriveSeed("sociograph-test"))).toEqual([
      0.868636, 0.83813, 0.098679, 0.748212, 0.919104,
    ]);
  });

  it("returns values in [0, 1)", () => {
    let s = deriveSeed("range-check");
    for (let i = 0; i < 1000; i++) {
      const d = nextRandom(s);
      expect(d.value).toBeGreaterThanOrEqual(0);
      expect(d.value).toBeLessThan(1);
      s = d.state;
    }
  });
});

describe("RNG state JSON round-trip", () => {
  it("a mid-stream state survives stringify/parse and resumes identically", () => {
    let s = deriveSeed("save-resume");
    for (let i = 0; i < 7; i++) s = nextRandom(s).state;
    const roundTripped = JSON.parse(JSON.stringify(s)) as number;
    expect(roundTripped).toBe(s);
    expect(nextRandom(roundTripped).value).toBe(nextRandom(s).value);
  });
});

describe("nextInt", () => {
  it("hits both inclusive endpoints over many draws", () => {
    let s = deriveSeed("dice");
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < 50000; i++) {
      const d = nextInt(s, 1, 6);
      min = Math.min(min, d.value);
      max = Math.max(max, d.value);
      s = d.state;
    }
    expect(min).toBe(1);
    expect(max).toBe(6);
  });

  it("returns the single value when min === max", () => {
    expect(nextInt(deriveSeed("x"), 3, 3).value).toBe(3);
  });

  it("throws on inverted or non-integer bounds", () => {
    expect(() => nextInt(0, 6, 1)).toThrow(RangeError);
    expect(() => nextInt(0, 1.5, 6)).toThrow(RangeError);
  });
});

describe("nextFloat", () => {
  it("stays within [min, max)", () => {
    let s = deriveSeed("f");
    for (let i = 0; i < 1000; i++) {
      const d = nextFloat(s, -2, 5);
      expect(d.value).toBeGreaterThanOrEqual(-2);
      expect(d.value).toBeLessThan(5);
      s = d.state;
    }
  });

  it("throws when min > max or a bound is non-finite", () => {
    expect(() => nextFloat(0, 5, -2)).toThrow(RangeError);
    expect(() => nextFloat(0, NaN, 1)).toThrow(RangeError);
    expect(() => nextFloat(0, 0, Infinity)).toThrow(RangeError);
  });
});

describe("pick", () => {
  it("returns undefined for an empty array", () => {
    expect(pick(deriveSeed("e"), []).value).toBeUndefined();
  });

  it("returns the sole element for a singleton", () => {
    expect(pick(deriveSeed("e"), ["only"]).value).toBe("only");
  });

  it("only ever returns members of the array", () => {
    const items = ["a", "b", "c"] as const;
    let s = deriveSeed("members");
    for (let i = 0; i < 200; i++) {
      const d = pick(s, items);
      expect(items).toContain(d.value);
      s = d.state;
    }
  });
});

describe("weightedPick", () => {
  it("returns undefined for an empty array", () => {
    expect(weightedPick(deriveSeed("w"), [], []).value).toBeUndefined();
  });

  it("returns undefined when all weights are zero (empty distribution, not last-item)", () => {
    expect(weightedPick(deriveSeed("w"), ["a", "b"], [0, 0]).value).toBeUndefined();
  });

  it("only picks positive-weight items", () => {
    const items = ["a", "b", "c"] as const;
    const weights = [0, 5, 0];
    let s = deriveSeed("weighted");
    for (let i = 0; i < 100; i++) {
      const d = weightedPick(s, items, weights);
      expect(d.value).toBe("b");
      s = d.state;
    }
  });

  it("throws on length mismatch or negative/non-finite weights", () => {
    expect(() => weightedPick(0, ["a", "b"], [1])).toThrow(RangeError);
    expect(() => weightedPick(0, ["a"], [-1])).toThrow(RangeError);
    expect(() => weightedPick(0, ["a"], [NaN])).toThrow(RangeError);
  });

  it("respects weight proportions over many draws", () => {
    const items = ["a", "b"] as const;
    const weights = [1, 9]; // b should win ~90% of the time
    let s = deriveSeed("proportion");
    let bCount = 0;
    for (let i = 0; i < 5000; i++) {
      const d = weightedPick(s, items, weights);
      if (d.value === "b") bCount++;
      s = d.state;
    }
    expect(bCount / 5000).toBeGreaterThan(0.85);
    expect(bCount / 5000).toBeLessThan(0.95);
  });

  it("always returns a positive-weight item even at the distribution's upper edge", () => {
    // Exercise every state across a sweep: the roll can land at exactly `total`,
    // hitting the float-edge fallback. The result must never be a zero-weight item.
    const items = ["zero", "win"] as const;
    const weights = [0, 1];
    let s = 0;
    for (let i = 0; i < 2000; i++) {
      const d = weightedPick(s, items, weights);
      expect(d.value).toBe("win");
      s = nextRandom(s).state;
    }
  });
});

describe("shuffle", () => {
  it("returns a permutation (same multiset) without mutating the input", () => {
    const input = [1, 2, 3, 4, 5];
    const snapshot = [...input];
    const { value: out } = shuffle(deriveSeed("shuf"), input);
    expect(input).toEqual(snapshot); // input untouched
    expect([...out].sort((a, b) => a - b)).toEqual(snapshot);
  });

  it("is deterministic for a fixed state", () => {
    const a = shuffle(123, ["a", "b", "c", "d"]).value;
    const b = shuffle(123, ["a", "b", "c", "d"]).value;
    expect(a).toEqual(b);
  });

  it("handles empty and singleton arrays", () => {
    expect(shuffle(1, []).value).toEqual([]);
    expect(shuffle(1, ["x"]).value).toEqual(["x"]);
  });
});
