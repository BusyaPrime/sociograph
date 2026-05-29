# 4. State management

- Status: Accepted
- Date: 2026-05-30

## Context

The UI needs a single source of truth for game state and a predictable way to
apply player actions, without coupling React components to engine internals.

## Decision

- A Zustand store holds the current `GameState` (produced by the engine) plus a
  dispatch function that runs engine update helpers and keeps the result.
- Engine state is immutable; the store replaces it with the new value returned by
  the engine rather than mutating in place.
- Components subscribe to slices of state through selectors.

Zustand is adopted as the decision here; the store itself is introduced alongside
the board in a later milestone.

## Consequences

- Minimal boilerplate compared with Redux, and none of the React Context
  re-render pitfalls for frequently changing state.
- The store is a thin binding layer; all logic stays in the pure engine, which
  keeps it testable (see ADR 0002).
- Selector-based subscriptions keep re-renders narrow as the board grows.
