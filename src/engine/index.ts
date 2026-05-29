/**
 * Public entry point for the game engine.
 *
 * Everything under `src/engine` is framework-free TypeScript: no React, no DOM,
 * no Tauri, and no I/O. All randomness flows through a single seedable RNG
 * (introduced in a later milestone). The UI layer consumes the engine only
 * through this module. The import boundary is enforced by ESLint.
 */

/** Semantic version of the engine's public contract. */
export const ENGINE_VERSION = "0.1.0";
