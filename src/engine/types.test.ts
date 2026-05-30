import {
  RESOURCE_KINDS,
  ZONES,
  COOLDOWN_KINDS,
  WEEKS_PER_QUARTER,
  ACTION_POINTS_PER_WEEK,
  STATE_SCHEMA_VERSION,
  asContactId,
  asDealId,
  asSectorId,
  assertNever,
} from "@engine/types";
import type { ResourcePool, Cooldowns, Contact, Deal, DealStage, Motivation } from "@engine/types";

// --- builders for valid sample values (every finite key present) ---
const pool = (n = 0): ResourcePool => ({
  capital: n,
  access: n,
  information: n,
  connections: n,
  influence: n,
  expertise: n,
  reputation: n,
});

const cds = (): Cooldowns => ({
  assess: 0,
  approach: 0,
  lever: 0,
  cultivate: 0,
  introduce: 0,
  exchange: 0,
  favor: 0,
});

const sampleContact = (): Contact => ({
  id: asContactId("c1"),
  name: "Иван",
  role: "investor",
  sector: asSectorId("capital"),
  zone: "white",
  trust: 0,
  suspicion: 0,
  loyalty: 0,
  volatility: 0.5,
  riskTolerance: 0.5,
  motivation: { dominant: "money" },
  resources: pool(1),
  edges: [],
  assessed: false,
  cultivateTicks: 0,
  burned: false,
  recruitedByRival: false,
  cooldowns: cds(),
  lastContactWeek: 0,
});

describe("vocabulary const-arrays", () => {
  it("RESOURCE_KINDS has all 7 kinds, unique", () => {
    expect(RESOURCE_KINDS).toHaveLength(7);
    expect(new Set(RESOURCE_KINDS).size).toBe(7);
  });

  it("ZONES is white -> red", () => {
    expect(ZONES).toEqual(["white", "blue", "yellow", "red"]);
  });

  it("COOLDOWN_KINDS includes favor (the bible's explicit cooldown) and is complete", () => {
    expect(COOLDOWN_KINDS).toContain("favor");
    expect(COOLDOWN_KINDS).toHaveLength(7);
  });

  it("exposes the engine constants", () => {
    expect(WEEKS_PER_QUARTER).toBe(12);
    expect(ACTION_POINTS_PER_WEEK).toBe(4);
    expect(STATE_SCHEMA_VERSION).toBe(1);
  });
});

describe("branded id constructors", () => {
  it("round-trip the raw string value", () => {
    expect(asContactId("x")).toBe("x");
    expect(asDealId("d")).toBe("d");
    expect(asSectorId("s")).toBe("s");
  });
});

describe("assertNever + exhaustive DealStage", () => {
  const label = (stage: DealStage): string => {
    switch (stage) {
      case "qualify":
        return "q";
      case "develop":
        return "d";
      case "bid":
        return "b";
      case "win":
        return "w";
      case "lost":
        return "l";
      default:
        return assertNever(stage);
    }
  };

  it("covers all five stages (incl. the lost terminal)", () => {
    expect(label("qualify")).toBe("q");
    expect(label("lost")).toBe("l");
  });

  it("assertNever throws on an impossible value", () => {
    expect(() => assertNever("nope" as never)).toThrow();
  });
});

describe("JSON round-trip (serializable-state invariant)", () => {
  it("a Contact round-trips deep-equal", () => {
    const c = sampleContact();
    expect(JSON.parse(JSON.stringify(c))).toEqual(c);
  });

  it("each Deal stage round-trips with its variant fields intact", () => {
    const base = {
      id: asDealId("d1"),
      name: "Contract",
      requirements: { resources: {} },
      payoff: pool(0),
    };
    const deals: Deal[] = [
      { ...base, stage: "qualify" },
      { ...base, stage: "develop", progress: 0.5 },
      { ...base, stage: "bid", bidAmount: 100 },
      { ...base, stage: "win", closedWeek: 10 },
      { ...base, stage: "lost", closedWeek: 11, reason: "rival" },
    ];
    expect(JSON.parse(JSON.stringify(deals))).toEqual(deals);
  });
});

describe("strict-flag compile invariants", () => {
  it("readonly mutation, exactOptional undefined, and union-spread are all compile errors", () => {
    const c = sampleContact();
    // @ts-expect-error readonly: a Contact field cannot be reassigned
    c.trust = 50;

    // @ts-expect-error exactOptionalPropertyTypes: cannot assign undefined to an optional key
    const m: Motivation = { dominant: "money", secondary: undefined };

    const d: Deal = {
      id: asDealId("d"),
      name: "x",
      requirements: { resources: {} },
      payoff: pool(0),
      stage: "qualify",
    };
    const partial: Partial<Deal> = { stage: "win" };
    // @ts-expect-error union-spread is unsound: a Deal cannot be built from a partial spread
    const bad: Deal = { ...d, ...partial };

    // touch the bindings so noUnusedLocals stays satisfied. NOTE: `readonly` is a
    // compile-time guarantee only — the suppressed `c.trust = 50` above DOES mutate
    // at runtime — so we assert on an untouched field instead.
    expect(c.name).toBe("Иван");
    expect(m.dominant).toBe("money");
    expect(bad.stage).toBeDefined();
  });
});
