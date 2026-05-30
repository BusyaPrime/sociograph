// ============================================================================
// src/engine/turn.ts — end-of-week advance (PR #3).
//
// `advanceWeek` closes the playable loop: the player spends action points on
// recruitment actions, then ends the week. This applies the per-week upkeep —
// refill AP, tick down cooldowns, decay neglected relationships — and advances
// the clock. Business tick, consequence/exposure decay, and rival turns layer
// on here in PR #5/#6; this PR owns only the recruitment-side upkeep.
// ============================================================================

import { type Contact, type GameState } from "./types";

/** Yellow/red contacts left untouched longer than this many weeks start to decay. */
export const NEGLECT_GRACE_WEEKS = 2;
/** Trust lost per week once a relationship is neglected past the grace window. */
export const NEGLECT_TRUST_DECAY = 1;

const clamp100 = (value: number): number => Math.max(0, Math.min(100, value));

/**
 * Advance the game by one week. Pure: returns a new state, never mutates input.
 * Order: decay neglected contacts (using the OUTGOING week), tick cooldowns,
 * then advance the clock and refill action points for the new week.
 *
 * @param actionPointsPerWeek the scenario's weekly AP grant (caller supplies it
 *        from ScenarioConfig; the engine does not hold the scenario registry).
 */
export function advanceWeek(state: GameState, actionPointsPerWeek: number): GameState {
  const contacts = state.contacts.map((c) => tickContact(c, state.time.week));
  return {
    ...state,
    contacts,
    time: { week: state.time.week + 1, actionPoints: actionPointsPerWeek },
  };
}

/** Apply per-week upkeep to one contact: neglect decay + cooldown tick-down. */
function tickContact(contact: Contact, week: number): Contact {
  if (contact.burned) return contact;

  let trust = contact.trust;
  if (isNeglected(contact, week)) {
    trust = clamp100(trust - NEGLECT_TRUST_DECAY);
  }

  const cooldowns = decrementCooldowns(contact.cooldowns);
  if (trust === contact.trust && cooldowns === contact.cooldowns) return contact;
  return { ...contact, trust, cooldowns };
}

/**
 * A yellow/red contact is neglected when the gap since last contact exceeds the
 * grace window. `lastContactWeek === 0` means never contacted; such a contact
 * still decays once enough weeks have elapsed (week > grace).
 */
function isNeglected(contact: Contact, week: number): boolean {
  if (contact.zone !== "yellow" && contact.zone !== "red") return false;
  return week - contact.lastContactWeek > NEGLECT_GRACE_WEEKS;
}

/** Tick every cooldown down by one week, flooring at 0. Same ref if all already 0. */
function decrementCooldowns(cooldowns: Contact["cooldowns"]): Contact["cooldowns"] {
  let changed = false;
  const next = { ...cooldowns };
  for (const key of Object.keys(next) as (keyof Contact["cooldowns"])[]) {
    if (next[key] > 0) {
      next[key] = next[key] - 1;
      changed = true;
    }
  }
  return changed ? next : cooldowns;
}
