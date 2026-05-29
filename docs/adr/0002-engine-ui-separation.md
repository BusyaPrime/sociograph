# 2. Engine and UI separation

- Status: Accepted
- Date: 2026-05-30

## Context

The game logic — relationships, recruitment, consequences, the business
simulation, and a rival operator — must be deterministic, unit-testable, and
independent of how it is presented.

## Decision

All game logic lives in `src/engine` as pure TypeScript:

- No imports of React, the DOM, Tauri APIs, or any I/O.
- All randomness flows through a single seedable RNG.
- Game state is immutable; update helpers return a new state value.

The boundary is enforced two ways: an ESLint `no-restricted-imports` rule applied
to `src/engine/**`, and code review. The UI in `src/ui` consumes the engine only
through its public entry point (the `@engine` alias).

## Consequences

- The engine can be exercised headlessly and run through thousands of seeded
  simulations for balancing (planned for a later milestone).
- Determinism is structural: an identical seed and inputs yield identical results.
- A boundary violation fails linting, so it cannot merge unnoticed.
- The UI can evolve, or be replaced, without touching game logic.
