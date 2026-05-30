import { advanceWeek, NEGLECT_GRACE_WEEKS } from "@engine/turn";
import { applyAction } from "@engine/recruit";
import { createInitialState } from "@engine/state";
import { quarterOf } from "@engine/state";
import { deriveSeed } from "@engine/rng";
import {
  asContactId,
  asDealId,
  asSectorId,
  type Contact,
  type GameState,
  type ResourcePool,
} from "@engine/types";

const pool = (over: Partial<ResourcePool> = {}): ResourcePool => ({
  capital: 0,
  access: 0,
  information: 0,
  connections: 0,
  influence: 0,
  expertise: 0,
  reputation: 0,
  ...over,
});

const contact = (id: string, over: Partial<Contact> = {}): Contact => ({
  id: asContactId(id),
  name: id,
  role: "x",
  sector: asSectorId("capital"),
  zone: "white",
  trust: 50,
  suspicion: 0,
  loyalty: 0,
  volatility: 0.5,
  riskTolerance: 0.5,
  motivation: { dominant: "money" },
  resources: pool(),
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
  ...over,
});

const AP_PER_WEEK = 4;
const stateWith = (contacts: Contact[]): GameState =>
  createInitialState(
    {
      id: "the-contract",
      version: 1,
      nameKey: "n",
      sectors: [{ id: asSectorId("capital"), nameKey: "s" }],
      startingTreasury: pool({ capital: 5 }),
      startingCompany: {
        cash: 100,
        weeklyBurn: 10,
        revenue: 0,
        productReadiness: 0,
        teamCapacity: 1,
        marketReputation: 50,
      },
      seedContacts: contacts,
      seedDeals: [
        {
          id: asDealId("d1"),
          name: "d",
          requirements: { resources: {} },
          payoff: pool(),
          stage: "qualify",
        },
      ],
      startReputation: 50,
      actionPointsPerWeek: AP_PER_WEEK,
      rivalAggression: 0.3,
      win: {
        contractDealId: asDealId("d1"),
        minReputation: 55,
        minProductReadiness: 0.8,
        cashFlowPositive: true,
      },
      lose: { exposureMax: 100, runwayMinWeeks: 0, rivalWinsContract: true },
    },
    deriveSeed("turn-test"),
  );

describe("advanceWeek — clock + action points", () => {
  it("increments the week and refills action points", () => {
    const s = { ...stateWith([contact("c1")]), time: { week: 1, actionPoints: 0 } };
    const next = advanceWeek(s, AP_PER_WEEK);
    expect(next.time.week).toBe(2);
    expect(next.time.actionPoints).toBe(AP_PER_WEEK);
  });

  it("crossing week 12 -> 13 advances the derived quarter", () => {
    const s = { ...stateWith([contact("c1")]), time: { week: 12, actionPoints: 0 } };
    const next = advanceWeek(s, AP_PER_WEEK);
    expect(next.time.week).toBe(13);
    expect(quarterOf(next.time.week)).toBe(2);
  });

  it("does not mutate the input state", () => {
    const s = stateWith([contact("c1", { zone: "yellow" })]);
    const snapshot = JSON.parse(JSON.stringify(s));
    advanceWeek(s, AP_PER_WEEK);
    expect(JSON.parse(JSON.stringify(s))).toEqual(snapshot);
  });
});

describe("advanceWeek — cooldown tick-down", () => {
  it("decrements positive cooldowns by one, flooring at 0", () => {
    const s = {
      ...stateWith([
        contact("c1", {
          cooldowns: {
            assess: 0,
            approach: 0,
            lever: 0,
            cultivate: 0,
            introduce: 0,
            exchange: 0,
            favor: 2,
          },
        }),
      ]),
      time: { week: 1, actionPoints: 0 },
    };
    const after1 = advanceWeek(s, AP_PER_WEEK);
    expect(after1.contacts[0]?.cooldowns.favor).toBe(1);
    const after2 = advanceWeek(after1, AP_PER_WEEK);
    expect(after2.contacts[0]?.cooldowns.favor).toBe(0);
    const after3 = advanceWeek(after2, AP_PER_WEEK);
    expect(after3.contacts[0]?.cooldowns.favor).toBe(0); // floored
  });
});

describe("advanceWeek — neglect decay", () => {
  it("decays a long-untouched yellow contact by 1 trust", () => {
    // week 10, last contacted week 1 -> gap 9 > grace -> decays
    const s = {
      ...stateWith([contact("c1", { zone: "yellow", trust: 50, lastContactWeek: 1 })]),
      time: { week: 10, actionPoints: 0 },
    };
    const next = advanceWeek(s, AP_PER_WEEK);
    expect(next.contacts[0]?.trust).toBe(49);
  });

  it("does NOT decay a recently-contacted contact within the grace window", () => {
    const s = {
      ...stateWith([contact("c1", { zone: "yellow", trust: 50, lastContactWeek: 9 })]),
      time: { week: 10, actionPoints: 0 }, // gap 1 <= grace
    };
    const next = advanceWeek(s, AP_PER_WEEK);
    expect(next.contacts[0]?.trust).toBe(50);
    expect(NEGLECT_GRACE_WEEKS).toBe(2);
  });

  it("does NOT decay white/blue contacts (only yellow/red relationships decay)", () => {
    const s = {
      ...stateWith([
        contact("w", { zone: "white", trust: 50, lastContactWeek: 0 }),
        contact("b", { zone: "blue", trust: 50, lastContactWeek: 0 }),
      ]),
      time: { week: 30, actionPoints: 0 },
    };
    const next = advanceWeek(s, AP_PER_WEEK);
    expect(next.contacts.find((c) => c.id === asContactId("w"))?.trust).toBe(50);
    expect(next.contacts.find((c) => c.id === asContactId("b"))?.trust).toBe(50);
  });

  it("does NOT decay a burned contact", () => {
    const s = {
      ...stateWith([contact("c1", { zone: "red", trust: 50, lastContactWeek: 1, burned: true })]),
      time: { week: 30, actionPoints: 0 },
    };
    const next = advanceWeek(s, AP_PER_WEEK);
    expect(next.contacts[0]?.trust).toBe(50);
  });
});

describe("playable loop integration", () => {
  it("spend AP across a week, end it, and resume with refilled AP", () => {
    let s = stateWith([contact("c1", { assessed: true, trust: 0 })]);
    expect(s.time.actionPoints).toBe(4);

    // spend 2 AP approaching the same contact
    const r1 = applyAction(s, { kind: "approach", contactId: asContactId("c1") });
    if (!r1.ok) throw new Error(r1.reason);
    const r2 = applyAction(r1.state, { kind: "approach", contactId: asContactId("c1") });
    if (!r2.ok) throw new Error(r2.reason);
    s = r2.state;
    expect(s.time.actionPoints).toBe(2);
    expect(s.contacts[0]?.trust).toBeGreaterThan(0);

    // end the week
    s = advanceWeek(s, AP_PER_WEEK);
    expect(s.time.week).toBe(2);
    expect(s.time.actionPoints).toBe(4);
  });
});
