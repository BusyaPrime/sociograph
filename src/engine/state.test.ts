import {
  createInitialState,
  setIn,
  updateIn,
  setContact,
  updateContact,
  removeContact,
  setDeal,
  updateDeal,
  replaceCompany,
  adjustResource,
  adjustScalar,
  addEvent,
  advanceRng,
  quarterOf,
  runwayWeeks,
  getContact,
  getDeal,
} from "@engine/state";
import { deriveSeed } from "@engine/rng";
import {
  STATE_SCHEMA_VERSION,
  asContactId,
  asDealId,
  asSectorId,
  type Company,
  type Contact,
  type Deal,
  type GameState,
  type ResourcePool,
  type ScenarioConfig,
} from "@engine/types";

// --- fixtures ---------------------------------------------------------------
const pool = (n = 0): ResourcePool => ({
  capital: n,
  access: n,
  information: n,
  connections: n,
  influence: n,
  expertise: n,
  reputation: n,
});

const contact = (id: string): Contact => ({
  id: asContactId(id),
  name: id,
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
  cooldowns: {
    assess: 0,
    approach: 0,
    lever: 0,
    cultivate: 0,
    introduce: 0,
    exchange: 0,
    favor: 0,
  },
  lastContactWeek: 0,
});

const company = (): Company => ({
  cash: 100,
  weeklyBurn: 10,
  revenue: 0,
  productReadiness: 0,
  teamCapacity: 1,
  marketReputation: 50,
});

const deal = (id: string): Deal => ({
  id: asDealId(id),
  name: id,
  requirements: { resources: {} },
  payoff: pool(0),
  stage: "qualify",
});

const scenario = (overrides: Partial<ScenarioConfig> = {}): ScenarioConfig => ({
  id: "the-contract",
  version: 3,
  nameKey: "scenario.the-contract.name",
  sectors: [{ id: asSectorId("capital"), nameKey: "sector.capital" }],
  startingTreasury: pool(2),
  startingCompany: company(),
  seedContacts: [contact("c1"), contact("c2")],
  seedDeals: [deal("d1")],
  startReputation: 50,
  actionPointsPerWeek: 4,
  rivalAggression: 0.3,
  win: {
    contractDealId: asDealId("d1"),
    minReputation: 55,
    minProductReadiness: 0.8,
    cashFlowPositive: true,
  },
  lose: { exposureMax: 100, runwayMinWeeks: 0, rivalWinsContract: true },
  ...overrides,
});

const freshState = (): GameState => createInitialState(scenario(), deriveSeed("seed"));

// deep-freeze so any accidental mutation throws in the test
function deepFreeze<T>(obj: T): T {
  if (obj && typeof obj === "object") {
    Object.values(obj).forEach((v) => deepFreeze(v));
    Object.freeze(obj);
  }
  return obj;
}

describe("createInitialState", () => {
  it("produces a valid playable initial state", () => {
    const s = freshState();
    expect(s.time).toEqual({ week: 1, actionPoints: 4 });
    expect(s.exposure).toBe(0);
    expect(s.reputation).toBe(50);
    expect(s.status).toBe("playing");
    expect(s.rngState).toBe(deriveSeed("seed"));
    expect(s.contacts).toHaveLength(2);
    expect(s.deals).toHaveLength(1);
    expect(s.eventLog).toEqual([]);
    expect(s.nextEventSeq).toBe(0);
  });

  it("stamps both schema and scenario versions", () => {
    const s = freshState();
    expect(s.stateVersion).toBe(STATE_SCHEMA_VERSION);
    expect(s.scenarioVersion).toBe(3); // scenario.version, not the schema version
  });

  it("initializes the rival as dormant with seeded aggression", () => {
    const s = freshState();
    expect(s.rival.status).toBe("dormant");
    expect(s.rival.aggression).toBe(0.3);
    expect(s.rival).not.toHaveProperty("targetContactId"); // absent, not undefined
  });

  it("is deterministic: same scenario + seed => deep-equal state", () => {
    expect(createInitialState(scenario(), deriveSeed("x"))).toEqual(
      createInitialState(scenario(), deriveSeed("x")),
    );
  });

  it("throws on duplicate contact ids", () => {
    expect(() =>
      createInitialState(scenario({ seedContacts: [contact("dup"), contact("dup")] }), 0),
    ).toThrow(/duplicate contact id/);
  });

  it("throws on duplicate deal ids", () => {
    expect(() =>
      createInitialState(scenario({ seedDeals: [deal("dup"), deal("dup")] }), 0),
    ).toThrow(/duplicate deal id/);
  });

  it("does not alias the scenario's seed arrays", () => {
    const sc = scenario();
    const s = createInitialState(sc, 0);
    expect(s.contacts).not.toBe(sc.seedContacts);
  });
});

describe("generic immutable helpers — no input mutation", () => {
  it("every helper returns a new top reference and leaves a frozen input intact", () => {
    const s = deepFreeze(freshState());
    expect(setIn(s, "exposure", 5)).not.toBe(s);
    expect(updateIn(s, "time", (t) => ({ ...t, week: t.week + 1 }))).not.toBe(s);
    expect(setContact(s, contact("c3"))).not.toBe(s);
    expect(updateContact(s, asContactId("c1"), (c) => ({ ...c, trust: 10 }))).not.toBe(s);
    expect(removeContact(s, asContactId("c1"))).not.toBe(s);
    expect(replaceCompany(s, company())).not.toBe(s);
    expect(advanceRng(s, 999)).not.toBe(s);
    // input untouched
    expect(s.exposure).toBe(0);
    expect(s.contacts).toHaveLength(2);
  });
});

describe("setContact / updateContact / removeContact", () => {
  it("setContact appends a new contact and replaces an existing one", () => {
    const s = freshState();
    const added = setContact(s, contact("c3"));
    expect(added.contacts).toHaveLength(3);
    const replaced = setContact(added, { ...contact("c1"), trust: 42 });
    expect(replaced.contacts).toHaveLength(3); // replaced, not appended
    expect(getContact(replaced, asContactId("c1"))?.trust).toBe(42);
  });

  it("updateContact is a same-reference no-op for an absent id", () => {
    const s = freshState();
    expect(updateContact(s, asContactId("nope"), (c) => c)).toBe(s);
  });

  it("removeContact drops the contact and is a no-op for an absent id", () => {
    const s = freshState();
    expect(removeContact(s, asContactId("c1")).contacts).toHaveLength(1);
    expect(removeContact(s, asContactId("nope"))).toBe(s);
  });
});

describe("setDeal / updateDeal", () => {
  it("updateDeal transitions a deal to a new variant", () => {
    const s = freshState();
    const won = updateDeal(s, asDealId("d1"), (d) => ({ ...d, stage: "win", closedWeek: 5 }));
    const d = getDeal(won, asDealId("d1"));
    expect(d?.stage).toBe("win");
  });

  it("setDeal appends an unknown deal and replaces an existing one", () => {
    const s = freshState();
    expect(setDeal(s, deal("d2")).deals).toHaveLength(2);
    const replaced = setDeal(s, { ...deal("d1"), name: "renamed" });
    expect(replaced.deals).toHaveLength(1); // replaced, not appended
    expect(getDeal(replaced, asDealId("d1"))?.name).toBe("renamed");
  });

  it("updateDeal is a same-reference no-op for an absent id", () => {
    const s = freshState();
    expect(updateDeal(s, asDealId("nope"), (d) => d)).toBe(s);
  });
});

describe("adjustResource", () => {
  it("adds and clamps at 0, leaving the other six kinds untouched", () => {
    const p = pool(5);
    expect(adjustResource(p, "capital", 3).capital).toBe(8);
    expect(adjustResource(p, "capital", -100).capital).toBe(0);
    expect(adjustResource(p, "capital", 3).access).toBe(5);
  });

  it("throws on a non-finite delta (a NaN field would break the JSON round-trip)", () => {
    expect(() => adjustResource(pool(5), "capital", NaN)).toThrow(RangeError);
    expect(() => adjustResource(pool(5), "capital", Infinity)).toThrow(RangeError);
  });
});

describe("adjustScalar — clamps to [0, 100]", () => {
  it("does not let exposure exceed 100 or reputation go below 0", () => {
    const s = freshState();
    expect(adjustScalar(s, "exposure", 130).exposure).toBe(100);
    expect(adjustScalar(s, "reputation", -80).reputation).toBe(0);
    expect(adjustScalar(s, "exposure", 30).exposure).toBe(30);
  });

  it("throws on a non-finite delta", () => {
    expect(() => adjustScalar(freshState(), "exposure", NaN)).toThrow(RangeError);
  });
});

describe("addEvent", () => {
  it("assigns sequential ids and grows the log", () => {
    let s = freshState();
    s = addEvent(s, { week: 1, kind: "system", messageKey: "a" });
    s = addEvent(s, { week: 1, kind: "deal", messageKey: "b" });
    expect(s.eventLog.map((e) => e.id)).toEqual(["e0", "e1"]);
    expect(s.nextEventSeq).toBe(2);
  });
});

describe("advanceRng", () => {
  it("changes only rngState", () => {
    const s = freshState();
    const next = advanceRng(s, 12345);
    expect(next.rngState).toBe(12345);
    expect({ ...next, rngState: s.rngState }).toEqual(s);
  });
});

describe("derived selectors", () => {
  it("quarterOf maps weeks to 1-based quarters", () => {
    expect(quarterOf(1)).toBe(1);
    expect(quarterOf(12)).toBe(1);
    expect(quarterOf(13)).toBe(2);
    expect(quarterOf(72)).toBe(6);
  });

  it("runwayWeeks divides cash by burn, and is Infinity when burn <= 0", () => {
    expect(runwayWeeks({ ...company(), cash: 100, weeklyBurn: 10 })).toBe(10);
    expect(runwayWeeks({ ...company(), cash: 95, weeklyBurn: 10 })).toBe(9); // floor
    expect(runwayWeeks({ ...company(), weeklyBurn: 0 })).toBe(Infinity);
  });
});

describe("whole-GameState JSON round-trip", () => {
  it("round-trips deep-equal after a few mutations (no Map/Set/class/fn)", () => {
    let s = freshState();
    s = adjustScalar(s, "exposure", 20);
    s = updateContact(s, asContactId("c1"), (c) => ({ ...c, trust: 30, landedLever: "money" }));
    s = updateDeal(s, asDealId("d1"), (d) => ({ ...d, stage: "develop", progress: 0.4 }));
    s = addEvent(s, { week: 1, kind: "recruitment", messageKey: "k", data: { n: 1 } });
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
  });
});
