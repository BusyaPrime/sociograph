import {
  ZONE_TRUST_GATES,
  RED_CULTIVATE_TICKS,
  hasMatchingLever,
  highestQualifiedZone,
  qualifiesForPromotion,
  zoneRank,
} from "@engine/zones";
import { asContactId, asSectorId, type Contact, type MotivationKind } from "@engine/types";

// A contact builder defaulting to a fresh white-zone prospect; override per case.
const contact = (over: Partial<Contact> = {}): Contact => ({
  id: asContactId("c1"),
  name: "c1",
  role: "investor",
  sector: asSectorId("capital"),
  zone: "white",
  trust: 0,
  suspicion: 0,
  loyalty: 0,
  volatility: 0.5,
  riskTolerance: 0.5,
  motivation: { dominant: "money" },
  resources: {
    capital: 0,
    access: 0,
    information: 0,
    connections: 0,
    influence: 0,
    expertise: 0,
    reputation: 0,
  },
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

const matched: Pick<Contact, "landedLever" | "motivation"> = {
  motivation: { dominant: "money" },
  landedLever: "money" as MotivationKind,
};

describe("ZONE_TRUST_GATES", () => {
  it("matches the design-bible thresholds", () => {
    expect(ZONE_TRUST_GATES).toEqual({ white: 0, blue: 25, yellow: 55, red: 85 });
    expect(RED_CULTIVATE_TICKS).toBe(3);
  });
});

describe("zoneRank", () => {
  it("is strictly ascending white < blue < yellow < red", () => {
    expect(zoneRank("white")).toBeLessThan(zoneRank("blue"));
    expect(zoneRank("blue")).toBeLessThan(zoneRank("yellow"));
    expect(zoneRank("yellow")).toBeLessThan(zoneRank("red"));
  });
});

describe("hasMatchingLever", () => {
  it("is true only when the landed lever equals the dominant motivation", () => {
    expect(hasMatchingLever(contact({ ...matched }))).toBe(true);
    expect(
      hasMatchingLever(contact({ motivation: { dominant: "money" }, landedLever: "ego" })),
    ).toBe(false);
    expect(hasMatchingLever(contact())).toBe(false); // no lever landed at all
  });
});

describe("highestQualifiedZone", () => {
  it("white below the blue gate", () => {
    expect(highestQualifiedZone(contact({ trust: 24 }))).toBe("white");
  });

  it("blue at the trust>=25 boundary", () => {
    expect(highestQualifiedZone(contact({ trust: 25 }))).toBe("blue");
  });

  it("caps at blue when trust is high but no matching lever has landed", () => {
    expect(highestQualifiedZone(contact({ trust: 99 }))).toBe("blue");
    expect(highestQualifiedZone(contact({ trust: 99, landedLever: "ego" }))).toBe("blue");
  });

  it("yellow needs trust>=55 AND a matching lever", () => {
    expect(highestQualifiedZone(contact({ trust: 55, ...matched }))).toBe("yellow");
    expect(highestQualifiedZone(contact({ trust: 54, ...matched }))).toBe("blue");
  });

  it("red needs trust>=85 AND matching lever AND >=3 cultivate ticks", () => {
    expect(highestQualifiedZone(contact({ trust: 85, ...matched, cultivateTicks: 3 }))).toBe("red");
    // one tick short -> caps at yellow
    expect(highestQualifiedZone(contact({ trust: 85, ...matched, cultivateTicks: 2 }))).toBe(
      "yellow",
    );
    // enough ticks but trust short -> yellow
    expect(highestQualifiedZone(contact({ trust: 84, ...matched, cultivateTicks: 9 }))).toBe(
      "yellow",
    );
  });
});

describe("qualifiesForPromotion", () => {
  it("is true when the qualified zone outranks the current zone", () => {
    expect(qualifiesForPromotion(contact({ zone: "white", trust: 30 }))).toBe(true);
  });

  it("is false when already at (or above) the qualified zone", () => {
    expect(qualifiesForPromotion(contact({ zone: "blue", trust: 30 }))).toBe(false);
    // sticky downward: a yellow contact whose trust dipped does not 'promote' to blue
    expect(qualifiesForPromotion(contact({ zone: "yellow", trust: 10 }))).toBe(false);
  });
});
