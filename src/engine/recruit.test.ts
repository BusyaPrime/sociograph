import { applyAction, actionAvailableInZone, FAVOR_COOLDOWN_WEEKS } from "@engine/recruit";
import type { ActionOutcome } from "@engine/recruit";
import { createInitialState } from "@engine/state";
import { deriveSeed } from "@engine/rng";
import {
  asContactId,
  asDealId,
  asSectorId,
  type Contact,
  type Edge,
  type GameState,
  type MotivationKind,
  type ResourcePool,
  type ScenarioConfig,
  type Zone,
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
  role: "investor",
  sector: asSectorId("capital"),
  zone: "white",
  trust: 0,
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

const stateWith = (contacts: Contact[], over: Partial<ScenarioConfig> = {}): GameState =>
  createInitialState(
    {
      id: "the-contract",
      version: 1,
      nameKey: "n",
      sectors: [{ id: asSectorId("capital"), nameKey: "s" }],
      startingTreasury: pool({ capital: 3, information: 3 }),
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
      actionPointsPerWeek: 4,
      rivalAggression: 0.3,
      win: {
        contractDealId: asDealId("d1"),
        minReputation: 55,
        minProductReadiness: 0.8,
        cashFlowPositive: true,
      },
      lose: { exposureMax: 100, runwayMinWeeks: 0, rivalWinsContract: true },
      ...over,
    },
    deriveSeed("recruit-test"),
  );

// assert success and return the next state, or fail the test loudly
const expectOk = (outcome: ActionOutcome): GameState => {
  if (!outcome.ok) throw new Error(`expected ok, got failure: ${outcome.reason}`);
  return outcome.state;
};
const c1 = asContactId("c1");

describe("applyAction — dispatch guards", () => {
  it("rejects when out of action points", () => {
    const s = { ...stateWith([contact("c1")]), time: { week: 1, actionPoints: 0 } };
    const r = applyAction(s, { kind: "assess", contactId: c1 });
    expect(r).toEqual({ ok: false, reason: "no-action-points" });
  });

  it("rejects an unknown contact", () => {
    const r = applyAction(stateWith([contact("c1")]), {
      kind: "assess",
      contactId: asContactId("ghost"),
    });
    expect(r).toEqual({ ok: false, reason: "contact-not-found" });
  });

  it("rejects a burned contact", () => {
    const r = applyAction(stateWith([contact("c1", { burned: true })]), {
      kind: "assess",
      contactId: c1,
    });
    expect(r).toEqual({ ok: false, reason: "contact-burned" });
  });

  it("spends exactly one action point on success", () => {
    const s = stateWith([contact("c1")]);
    const next = expectOk(applyAction(s, { kind: "assess", contactId: c1 }));
    expect(next.time.actionPoints).toBe(s.time.actionPoints - 1);
  });

  it("does not mutate the input state", () => {
    const s = stateWith([contact("c1")]);
    const snapshot = JSON.parse(JSON.stringify(s));
    applyAction(s, { kind: "assess", contactId: c1 });
    expect(JSON.parse(JSON.stringify(s))).toEqual(snapshot);
  });
});

describe("assess", () => {
  it("marks the contact assessed and raises exposure", () => {
    const next = expectOk(
      applyAction(stateWith([contact("c1")]), { kind: "assess", contactId: c1 }),
    );
    expect(next.contacts[0]?.assessed).toBe(true);
    expect(next.exposure).toBe(1);
  });
});

describe("approach", () => {
  it("requires prior assessment", () => {
    const r = applyAction(stateWith([contact("c1")]), { kind: "approach", contactId: c1 });
    expect(r).toEqual({ ok: false, reason: "not-assessed" });
  });

  it("adds diminishing trust (max 10 at trust 0)", () => {
    const next = expectOk(
      applyAction(stateWith([contact("c1", { assessed: true, trust: 0 })]), {
        kind: "approach",
        contactId: c1,
      }),
    );
    expect(next.contacts[0]?.trust).toBe(10);
  });

  it("diminishes as trust rises and never drops below 2", () => {
    const next = expectOk(
      applyAction(stateWith([contact("c1", { assessed: true, trust: 80 })]), {
        kind: "approach",
        contactId: c1,
      }),
    );
    expect(next.contacts[0]?.trust).toBe(82); // 10 - floor(80/20)*2 = 2
  });
});

describe("lever", () => {
  const money: MotivationKind = "money";

  it("matched lever: big trust gain, small suspicion, spends capital, sets landedLever", () => {
    const s = stateWith([contact("c1", { assessed: true, motivation: { dominant: "money" } })]);
    const next = expectOk(applyAction(s, { kind: "lever", contactId: c1, motivation: money }));
    // round(20 * (0.8 + 50/250)) = round(20 * 1.0) = 20
    expect(next.contacts[0]?.trust).toBe(20);
    expect(next.contacts[0]?.suspicion).toBe(2);
    expect(next.contacts[0]?.landedLever).toBe("money");
    expect(next.treasury.capital).toBe(s.treasury.capital - 1);
  });

  it("mismatched lever: tiny trust, suspicion spike, no landedLever", () => {
    const s = stateWith([contact("c1", { assessed: true, motivation: { dominant: "vision" } })]);
    const next = expectOk(applyAction(s, { kind: "lever", contactId: c1, motivation: money }));
    expect(next.contacts[0]?.trust).toBe(2);
    expect(next.contacts[0]?.suspicion).toBe(8);
    expect(next.contacts[0]?.landedLever).toBeUndefined();
  });

  it("need-mismatch is the most suspicious branch", () => {
    const s = stateWith([contact("c1", { assessed: true, motivation: { dominant: "need" } })]);
    const next = expectOk(applyAction(s, { kind: "lever", contactId: c1, motivation: money }));
    expect(next.contacts[0]?.suspicion).toBe(14);
  });

  it("free vision/ego levers cost no treasury", () => {
    const s = stateWith([contact("c1", { assessed: true, motivation: { dominant: "vision" } })]);
    const next = expectOk(applyAction(s, { kind: "lever", contactId: c1, motivation: "vision" }));
    expect(next.treasury).toEqual(s.treasury);
  });

  it("rejects an unaffordable money lever", () => {
    const s = stateWith([contact("c1", { assessed: true })], {
      startingTreasury: pool({ capital: 0 }),
    });
    const r = applyAction(s, { kind: "lever", contactId: c1, motivation: money });
    expect(r).toEqual({ ok: false, reason: "unaffordable" });
  });
});

describe("cultivate", () => {
  it("adds 4 trust; accrues a tick only while yellow", () => {
    const white = expectOk(
      applyAction(stateWith([contact("c1", { zone: "white" })]), {
        kind: "cultivate",
        contactId: c1,
      }),
    );
    expect(white.contacts[0]?.cultivateTicks).toBe(0);

    const yellow = expectOk(
      applyAction(stateWith([contact("c1", { zone: "yellow" })]), {
        kind: "cultivate",
        contactId: c1,
      }),
    );
    expect(yellow.contacts[0]?.cultivateTicks).toBe(1);
  });
});

describe("zone promotion + edge ripple", () => {
  it("crossing the blue gate promotes white -> blue", () => {
    const s = stateWith([contact("c1", { assessed: true, trust: 22 })]);
    const next = expectOk(applyAction(s, { kind: "approach", contactId: c1 })); // +? -> >=25
    // trust 22 -> +? : 10 - floor(22/20)*2 = 8 => 30 -> blue
    expect(next.contacts[0]?.zone).toBe("blue");
  });

  it("promoting to yellow ripples ally trust up and rival trust down", () => {
    const ally: Edge = { to: asContactId("ally"), valence: "ally", weight: 1 };
    const rival: Edge = { to: asContactId("rival"), valence: "rival", weight: 1 };
    const subject = contact("c1", {
      assessed: true,
      trust: 53,
      motivation: { dominant: "money" },
      landedLever: "money",
      edges: [ally, rival],
    });
    const s = stateWith([subject, contact("ally", { trust: 40 }), contact("rival", { trust: 40 })]);
    // approach 53 -> +? = 10 - floor(53/20)*2 = 6 => 59, with matched lever => yellow
    const next = expectOk(applyAction(s, { kind: "approach", contactId: c1 }));
    expect(next.contacts.find((c) => c.id === asContactId("c1"))?.zone).toBe("yellow");
    expect(next.contacts.find((c) => c.id === asContactId("ally"))?.trust).toBe(45); // +5
    expect(next.contacts.find((c) => c.id === asContactId("rival"))?.trust).toBe(35); // -5
  });
});

describe("burn + contagion", () => {
  it("suspicion hitting 100 burns the contact and ripples to neighbors", () => {
    const neighbor: Edge = { to: asContactId("n"), valence: "neutral", weight: 1 };
    const subject = contact("c1", {
      assessed: true,
      suspicion: 92,
      motivation: { dominant: "need" }, // need-mismatch lever adds +14 suspicion -> 106
      edges: [neighbor],
    });
    const s = stateWith([subject, contact("n", { suspicion: 0 })]);
    const next = expectOk(applyAction(s, { kind: "lever", contactId: c1, motivation: "money" }));
    expect(next.contacts.find((c) => c.id === c1)?.burned).toBe(true);
    expect(next.contacts.find((c) => c.id === asContactId("n"))?.suspicion).toBe(10); // 10*|1|
    expect(next.exposure).toBe(18); // +10 lever need-mismatch exposure, +8 burn
  });
});

describe("exchange", () => {
  it("rejects outside yellow/red", () => {
    const r = applyAction(stateWith([contact("c1", { zone: "blue" })]), {
      kind: "exchange",
      contactId: c1,
      give: "capital",
      receive: "access",
    });
    expect(r).toEqual({ ok: false, reason: "wrong-zone" });
  });

  it("swaps one treasury unit for one the contact holds", () => {
    const s = stateWith([contact("c1", { zone: "yellow", resources: pool({ access: 2 }) })]);
    const next = expectOk(
      applyAction(s, { kind: "exchange", contactId: c1, give: "capital", receive: "access" }),
    );
    expect(next.treasury.capital).toBe(s.treasury.capital - 1);
    expect(next.treasury.access).toBe(s.treasury.access + 1);
    expect(next.contacts[0]?.resources.access).toBe(1);
  });

  it("rejects a degenerate give===receive swap (would duplicate the resource)", () => {
    const s = stateWith([contact("c1", { zone: "yellow", resources: pool({ capital: 2 }) })]);
    const r = applyAction(s, {
      kind: "exchange",
      contactId: c1,
      give: "capital",
      receive: "capital",
    });
    expect(r).toEqual({ ok: false, reason: "resource-unavailable" });
  });

  it("rejects when the treasury cannot afford the give", () => {
    const s = stateWith([contact("c1", { zone: "yellow", resources: pool({ access: 2 }) })], {
      startingTreasury: pool({ capital: 0 }),
    });
    const r = applyAction(s, {
      kind: "exchange",
      contactId: c1,
      give: "capital",
      receive: "access",
    });
    expect(r).toEqual({ ok: false, reason: "unaffordable" });
  });

  it("rejects when the contact lacks the requested resource", () => {
    const s = stateWith([contact("c1", { zone: "yellow", resources: pool({ access: 0 }) })]);
    const r = applyAction(s, {
      kind: "exchange",
      contactId: c1,
      give: "capital",
      receive: "access",
    });
    expect(r).toEqual({ ok: false, reason: "resource-unavailable" });
  });
});

describe("favor", () => {
  it("rejects outside red", () => {
    const r = applyAction(stateWith([contact("c1", { zone: "yellow" })]), {
      kind: "favor",
      contactId: c1,
      resource: "influence",
    });
    expect(r).toEqual({ ok: false, reason: "wrong-zone" });
  });

  it("draws a resource, dips trust, and sets the cooldown", () => {
    const s = stateWith([
      contact("c1", { zone: "red", trust: 90, resources: pool({ influence: 2 }) }),
    ]);
    const next = expectOk(applyAction(s, { kind: "favor", contactId: c1, resource: "influence" }));
    expect(next.treasury.influence).toBe(s.treasury.influence + 1);
    expect(next.contacts[0]?.resources.influence).toBe(1);
    expect(next.contacts[0]?.trust).toBe(88);
    expect(next.contacts[0]?.cooldowns.favor).toBe(FAVOR_COOLDOWN_WEEKS);
  });

  it("rejects when the red contact lacks the requested resource", () => {
    const s = stateWith([contact("c1", { zone: "red", resources: pool({ influence: 0 }) })]);
    const r = applyAction(s, { kind: "favor", contactId: c1, resource: "influence" });
    expect(r).toEqual({ ok: false, reason: "resource-unavailable" });
  });

  it("rejects while on cooldown", () => {
    const s = stateWith([
      contact("c1", {
        zone: "red",
        resources: pool({ influence: 2 }),
        cooldowns: {
          assess: 0,
          approach: 0,
          lever: 0,
          cultivate: 0,
          introduce: 0,
          exchange: 0,
          favor: 1,
        },
      }),
    ]);
    const r = applyAction(s, { kind: "favor", contactId: c1, resource: "influence" });
    expect(r).toEqual({ ok: false, reason: "on-cooldown" });
  });
});

describe("actionAvailableInZone", () => {
  it("gates favor to red and exchange to yellow/red", () => {
    const zones: Zone[] = ["white", "blue", "yellow", "red"];
    expect(zones.filter((z) => actionAvailableInZone("favor", z))).toEqual(["red"]);
    expect(zones.filter((z) => actionAvailableInZone("exchange", z))).toEqual(["yellow", "red"]);
    expect(zones.every((z) => actionAvailableInZone("approach", z))).toBe(true);
  });
});
