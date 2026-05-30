// ============================================================================
// src/engine/zones.ts — zone-gate logic (PR #3).
//
// The four zones form an ascending ladder (white -> blue -> yellow -> red). A
// contact's zone is NEVER set by a threshold alone: it is derived from the
// contact's full state through `highestQualifiedZone`, the single authority.
// This keeps the "which zone is a contact in" question from drifting across
// call sites (the stored-derivable risk flagged in the PR #2 review).
//
// Gates (design bible §4.2):
//   white  -> blue:   trust >= 25
//   blue   -> yellow: trust >= 55 AND a matching lever has landed
//   yellow -> red:    trust >= 85 AND >= 3 cultivate ticks accrued while yellow
// ============================================================================

import type { Contact, Zone } from "./types";

/** Trust thresholds per ascending zone. white has no gate (everyone qualifies). */
export const ZONE_TRUST_GATES = {
  white: 0,
  blue: 25,
  yellow: 55,
  red: 85,
} as const satisfies Record<Zone, number>;

/** Cultivate ticks (while yellow) required to qualify for red. */
export const RED_CULTIVATE_TICKS = 3;

/** A lever "matches" when the landed lever equals the contact's dominant motivation. */
export function hasMatchingLever(contact: Contact): boolean {
  return contact.landedLever === contact.motivation.dominant;
}

/**
 * The highest zone a contact currently qualifies for, derived from its full
 * state. Gates are checked top-down; each higher gate ALSO requires its trust
 * threshold, so a high-trust contact without a matching lever caps at blue.
 */
export function highestQualifiedZone(contact: Contact): Zone {
  const { trust } = contact;
  if (
    trust >= ZONE_TRUST_GATES.red &&
    hasMatchingLever(contact) &&
    contact.cultivateTicks >= RED_CULTIVATE_TICKS
  ) {
    return "red";
  }
  if (trust >= ZONE_TRUST_GATES.yellow && hasMatchingLever(contact)) {
    return "yellow";
  }
  if (trust >= ZONE_TRUST_GATES.blue) {
    return "blue";
  }
  return "white";
}

/**
 * Whether a contact qualifies for a zone strictly higher than its current one.
 * Used by recruitment to decide when to promote (and fire edge-valence ripples).
 */
export function qualifiesForPromotion(contact: Contact): boolean {
  return zoneRank(highestQualifiedZone(contact)) > zoneRank(contact.zone);
}

/** Ascending rank of a zone (white=0 .. red=3). */
export function zoneRank(zone: Zone): number {
  switch (zone) {
    case "white":
      return 0;
    case "blue":
      return 1;
    case "yellow":
      return 2;
    case "red":
      return 3;
  }
}
