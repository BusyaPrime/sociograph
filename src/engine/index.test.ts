import { ENGINE_VERSION } from "@engine/index";

describe("engine public API", () => {
  it("exposes a semver-shaped version string", () => {
    expect(ENGINE_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
