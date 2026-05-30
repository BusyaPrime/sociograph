// ============================================================================
// src/engine/state.ts — initial-state factory + generic immutable helpers +
// pure derived selectors (PR #2, design v2).
//
// These are STRUCTURE-PRESERVING primitives only — no game rules. Every helper
// returns a NEW value and never mutates its input. Game-rule behavior (trust
// gates, business tick, consequences, rival logic) is layered on top in PR #3-#6.
// ============================================================================

import {
  STATE_SCHEMA_VERSION,
  WEEKS_PER_QUARTER,
  type Company,
  type Contact,
  type ContactId,
  type Deal,
  type DealId,
  type GameEvent,
  type GameState,
  type ResourceKind,
  type ResourcePool,
  type RngState,
  type ScenarioConfig,
} from "./types";

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Project an authored scenario into a valid, playable initial GameState.
 * Deterministic: the same (scenario, seed) yields a deep-equal state every call.
 * Performs no game rules — only structural projection plus integrity asserts.
 *
 * @param scenario authored, immutable scenario data (held in a caller registry)
 * @param rngState already-derived int32 seed (use deriveSeed at the call site)
 * @throws if any contact or deal id is duplicated in the scenario seed data
 */
export function createInitialState(scenario: ScenarioConfig, rngState: RngState): GameState {
  assertUniqueIds(
    scenario.seedContacts.map((c) => c.id),
    "contact",
  );
  assertUniqueIds(
    scenario.seedDeals.map((d) => d.id),
    "deal",
  );

  return {
    time: { week: 1, actionPoints: scenario.actionPointsPerWeek },
    treasury: scenario.startingTreasury,
    contacts: scenario.seedContacts.slice(),
    company: scenario.startingCompany,
    deals: scenario.seedDeals.slice(),
    exposure: 0,
    reputation: scenario.startReputation,
    rngState,
    rival: {
      status: "dormant",
      aggression: scenario.rivalAggression,
      heat: 0,
      recruitedContactIds: [],
      lastActedWeek: 0,
    },
    eventLog: [],
    nextEventSeq: 0,
    scenarioId: scenario.id,
    scenarioVersion: scenario.version,
    stateVersion: STATE_SCHEMA_VERSION,
    status: "playing",
  };
}

function assertUniqueIds(ids: readonly string[], label: string): void {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) {
      throw new Error(`createInitialState: duplicate ${label} id "${id}" in scenario seed data`);
    }
    seen.add(id);
  }
}

// ---------------------------------------------------------------------------
// Generic immutable update helpers
// ---------------------------------------------------------------------------

/** Replace one top-level field of any object, preserving its exact type. */
export function setIn<T extends object, K extends keyof T>(obj: T, key: K, value: T[K]): T {
  return { ...obj, [key]: value };
}

/** Map one top-level field through `fn`. */
export function updateIn<T extends object, K extends keyof T>(
  obj: T,
  key: K,
  fn: (value: T[K]) => T[K],
): T {
  return { ...obj, [key]: fn(obj[key]) };
}

/** Upsert a contact: replace in place if the id exists, otherwise append. */
export function setContact(state: GameState, contact: Contact): GameState {
  const idx = state.contacts.findIndex((c) => c.id === contact.id);
  const contacts =
    idx === -1
      ? [...state.contacts, contact]
      : state.contacts.map((c, i) => (i === idx ? contact : c));
  return { ...state, contacts };
}

/** Map one contact by id; no-op (same reference) if the id is absent. */
export function updateContact(
  state: GameState,
  id: ContactId,
  fn: (contact: Contact) => Contact,
): GameState {
  const idx = state.contacts.findIndex((c) => c.id === id);
  if (idx === -1) return state;
  return { ...state, contacts: state.contacts.map((c, i) => (i === idx ? fn(c) : c)) };
}

/** Remove a contact by id; no-op (same reference) if the id is absent. */
export function removeContact(state: GameState, id: ContactId): GameState {
  const contacts = state.contacts.filter((c) => c.id !== id);
  if (contacts.length === state.contacts.length) return state;
  return { ...state, contacts };
}

/** Upsert a deal: replace in place if the id exists, otherwise append. */
export function setDeal(state: GameState, deal: Deal): GameState {
  const idx = state.deals.findIndex((d) => d.id === deal.id);
  const deals =
    idx === -1 ? [...state.deals, deal] : state.deals.map((d, i) => (i === idx ? deal : d));
  return { ...state, deals };
}

/** Map one deal by id; no-op if absent. Used for stage transitions (whole new variant). */
export function updateDeal(state: GameState, id: DealId, fn: (deal: Deal) => Deal): GameState {
  const idx = state.deals.findIndex((d) => d.id === id);
  if (idx === -1) return state;
  return { ...state, deals: state.deals.map((d, i) => (i === idx ? fn(d) : d)) };
}

/** Replace the whole company sub-object. */
export function replaceCompany(state: GameState, company: Company): GameState {
  return { ...state, company };
}

/** Adjust one resource in a pool by `delta`, clamped at 0 (no negative holdings).
 *  @throws if delta is not finite (a NaN/Infinity field would break the JSON round-trip). */
export function adjustResource(
  pool: ResourcePool,
  kind: ResourceKind,
  delta: number,
): ResourcePool {
  if (!Number.isFinite(delta)) {
    throw new RangeError(`adjustResource: delta must be finite, got ${delta}`);
  }
  return { ...pool, [kind]: Math.max(0, pool[kind] + delta) };
}

/**
 * Adjust a bounded 0..100 GameState scalar by `delta`, clamped to [0, 100].
 * (Symmetry with adjustResource's floor; keeps win/lose thresholds and UI gauges
 * in range. week/quarter/actionPoints live under state.time — use updateIn.)
 */
export function adjustScalar(
  state: GameState,
  key: "exposure" | "reputation",
  delta: number,
): GameState {
  if (!Number.isFinite(delta)) {
    throw new RangeError(`adjustScalar: delta must be finite, got ${delta}`);
  }
  return { ...state, [key]: clamp01to100(state[key] + delta) };
}

/** Append an event with a deterministic sequential id; bumps nextEventSeq. */
export function addEvent(state: GameState, event: Omit<GameEvent, "id">): GameState {
  const withId: GameEvent = { ...event, id: `e${state.nextEventSeq}` };
  return { ...state, eventLog: [...state.eventLog, withId], nextEventSeq: state.nextEventSeq + 1 };
}

/** Thread a freshly-drawn RNG state back into GameState (the only rng writer). */
export function advanceRng(state: GameState, rngState: RngState): GameState {
  return { ...state, rngState };
}

// ---------------------------------------------------------------------------
// Pure derived selectors (computed, never stored)
// ---------------------------------------------------------------------------

/** Quarter for a week (1-based): weeks 1-12 -> Q1, 13-24 -> Q2, ... */
export function quarterOf(week: number): number {
  return Math.ceil(week / WEEKS_PER_QUARTER);
}

/** Weeks of runway: Infinity when burn <= 0, else floor(cash / weeklyBurn). */
export function runwayWeeks(company: Company): number {
  if (company.weeklyBurn <= 0) return Infinity;
  return Math.floor(company.cash / company.weeklyBurn);
}

export function getContact(state: GameState, id: ContactId): Contact | undefined {
  return state.contacts.find((c) => c.id === id);
}

export function getDeal(state: GameState, id: DealId): Deal | undefined {
  return state.deals.find((d) => d.id === id);
}

// ---------------------------------------------------------------------------

function clamp01to100(value: number): number {
  return Math.max(0, Math.min(100, value));
}
