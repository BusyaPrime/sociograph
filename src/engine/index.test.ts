import {
  ENGINE_VERSION,
  RESOURCE_KINDS,
  deriveSeed,
  nextRandom,
  createInitialState,
  runwayWeeks,
} from "@engine/index";

describe("engine public API", () => {
  it("exposes a semver-shaped version string, bumped for the engine core", () => {
    expect(ENGINE_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    expect(ENGINE_VERSION).toBe("0.2.0");
  });

  it("re-exports the types, rng, and state surfaces through the barrel", () => {
    // a value from each module is reachable via the single public entry point
    expect(RESOURCE_KINDS).toHaveLength(7); // types
    expect(typeof deriveSeed).toBe("function"); // rng
    expect(typeof nextRandom).toBe("function"); // rng
    expect(typeof createInitialState).toBe("function"); // state
    expect(typeof runwayWeeks).toBe("function"); // state
  });
});
