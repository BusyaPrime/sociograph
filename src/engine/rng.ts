// ============================================================================
// src/engine/rng.ts — seedable, purely-functional RNG (PR #2, design v2).
//
// Every draw is a pure function of an int32 state: it returns the value AND the
// next state, which the caller threads forward. There is no hidden mutable
// closure, no clock, no global random source — so an identical seed yields a
// byte-identical stream, and an int32 state round-trips through JSON unchanged
// (saves replay exactly). Algorithm: mulberry32 with its canonical constants;
// string seeds are folded to int32 with FNV-1a.
// ============================================================================

import type { RngState } from "./types";

/** A drawn value paired with the advanced RNG state. Thread `state` forward. */
export interface Draw<T> {
  readonly value: T;
  readonly state: RngState;
}

/** Canonical mulberry32 step: state -> { value in [0,1), next state }. */
export function nextRandom(state: RngState): Draw<number> {
  const s = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(s ^ (s >>> 15), 1 | s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { value, state: s };
}

/**
 * Deterministically derive an int32 RNG seed from a string or number.
 * - number -> truncated to int32 (`| 0`).
 * - string -> FNV-1a hash folded to int32.
 */
export function deriveSeed(seed: string | number): RngState {
  if (typeof seed === "number") return seed | 0;
  let h = 0x811c9dc5; // FNV-1a offset basis (2166136261)
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193); // FNV prime (16777619)
  }
  return h | 0;
}

/**
 * Integer in [min, max] inclusive.
 * @throws if bounds are not integers or min > max (a programming error, not a
 *         random outcome — fail loud rather than return a silently wrong range).
 */
export function nextInt(state: RngState, min: number, max: number): Draw<number> {
  if (!Number.isInteger(min) || !Number.isInteger(max)) {
    throw new RangeError(`nextInt bounds must be integers, got [${min}, ${max}]`);
  }
  if (min > max) {
    throw new RangeError(`nextInt requires min <= max, got [${min}, ${max}]`);
  }
  const { value, state: next } = nextRandom(state);
  return { value: min + Math.floor(value * (max - min + 1)), state: next };
}

/**
 * Float in [min, max).
 * @throws if min > max.
 */
export function nextFloat(state: RngState, min: number, max: number): Draw<number> {
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    throw new RangeError(`nextFloat bounds must be finite, got [${min}, ${max}]`);
  }
  if (min > max) {
    throw new RangeError(`nextFloat requires min <= max, got [${min}, ${max}]`);
  }
  const { value, state: next } = nextRandom(state);
  return { value: min + value * (max - min), state: next };
}

/**
 * Pick one element uniformly. Returns `undefined` for an empty array (honest
 * under noUncheckedIndexedAccess — callers pattern-match on it).
 */
export function pick<T>(state: RngState, items: readonly T[]): Draw<T | undefined> {
  if (items.length === 0) return { value: undefined, state };
  const { value: idx, state: next } = nextInt(state, 0, items.length - 1);
  return { value: items[idx], state: next };
}

/**
 * Weighted pick. `weights[i]` is the relative weight of `items[i]`.
 * Returns `undefined` for an empty array OR when all weights are zero (an empty
 * distribution is a caller signal, not a silent last-item fallback).
 * @throws if weights.length !== items.length or any weight is negative/non-finite.
 */
export function weightedPick<T>(
  state: RngState,
  items: readonly T[],
  weights: readonly number[],
): Draw<T | undefined> {
  if (weights.length !== items.length) {
    throw new RangeError(
      `weightedPick: weights length ${weights.length} !== items length ${items.length}`,
    );
  }
  let total = 0;
  for (const w of weights) {
    if (!Number.isFinite(w) || w < 0) {
      throw new RangeError(`weightedPick: weights must be finite and >= 0, got ${w}`);
    }
    total += w;
  }
  if (items.length === 0 || total === 0) return { value: undefined, state };

  const { value: roll, state: next } = nextFloat(state, 0, total);
  let cumulative = 0;
  for (let i = 0; i < items.length; i++) {
    cumulative += weights[i] as number; // length-checked above; finite key by index
    if (roll < cumulative) return { value: items[i], state: next };
  }
  // Floating-point edge: roll === total. Fall back to the last positive-weight item.
  for (let i = items.length - 1; i >= 0; i--) {
    if ((weights[i] as number) > 0) return { value: items[i], state: next };
  }
  return { value: undefined, state: next };
}

/**
 * Fisher–Yates shuffle. Returns a NEW array (input untouched) and the advanced
 * state. Deterministic for a given state.
 */
export function shuffle<T>(state: RngState, items: readonly T[]): Draw<readonly T[]> {
  const out = items.slice();
  let s = state;
  for (let i = out.length - 1; i > 0; i--) {
    const draw = nextInt(s, 0, i);
    s = draw.state;
    const j = draw.value;
    const tmp = out[i] as T;
    out[i] = out[j] as T;
    out[j] = tmp;
  }
  return { value: out, state: s };
}
