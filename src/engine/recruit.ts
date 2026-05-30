// ============================================================================
// src/engine/recruit.ts — recruitment actions (PR #3).
//
// Each action spends Action Points and transforms one contact (and sometimes
// its neighbors) deterministically. The pure formulas live here; the bible
// (§4.4/§4.5) is the source for the constants. Randomness flows through the
// game's RNG (state.rngState), never a global source.
//
// Failure is normal game flow, not an exception: `applyAction` returns a
// discriminated ActionOutcome so the UI can show *why* an action was rejected
// (no AP, on cooldown, wrong zone, unaffordable) without a try/catch.
// ============================================================================

import { updateContact } from "./state";
import { highestQualifiedZone, qualifiesForPromotion } from "./zones";
import {
  type Contact,
  type ContactId,
  type GameState,
  type MotivationKind,
  type ResourceKind,
  type Zone,
} from "./types";

/** The recruitment actions a player can spend an AP on. */
export type RecruitActionKind =
  | "assess"
  | "approach"
  | "lever"
  | "cultivate"
  | "exchange"
  | "favor";

/** A lever targets one of the four motivation axes. */
export interface LeverAction {
  readonly kind: "lever";
  readonly contactId: ContactId;
  readonly motivation: MotivationKind;
}
/** Exchange gives one treasury resource to receive one the contact holds. */
export interface ExchangeAction {
  readonly kind: "exchange";
  readonly contactId: ContactId;
  readonly give: ResourceKind;
  readonly receive: ResourceKind;
}
/** Favor draws one unit of a chosen resource the contact holds (red only). */
export interface FavorAction {
  readonly kind: "favor";
  readonly contactId: ContactId;
  readonly resource: ResourceKind;
}
/** The simple single-target actions. */
export interface SimpleAction {
  readonly kind: "assess" | "approach" | "cultivate";
  readonly contactId: ContactId;
}
export type RecruitAction = SimpleAction | LeverAction | ExchangeAction | FavorAction;

export type ActionFailureReason =
  | "no-action-points"
  | "contact-not-found"
  | "contact-burned"
  | "on-cooldown"
  | "wrong-zone"
  | "not-assessed"
  | "unaffordable"
  | "resource-unavailable";

export type ActionOutcome =
  | { readonly ok: true; readonly state: GameState }
  | { readonly ok: false; readonly reason: ActionFailureReason };

const fail = (reason: ActionFailureReason): ActionOutcome => ({ ok: false, reason });
const ok = (state: GameState): ActionOutcome => ({ ok: true, state });

/** AP cost is uniform (1) across recruitment actions per the bible. */
export const ACTION_POINT_COST = 1;
/** Favor cannot be repeated for this many weeks after use. */
export const FAVOR_COOLDOWN_WEEKS = 2;
const SUSPICION_BURN_THRESHOLD = 100;

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));
const clamp100 = (value: number): number => clamp(value, 0, 100);

/**
 * Apply a recruitment action. Returns a new state on success, or a typed
 * failure reason. Never mutates the input state.
 */
export function applyAction(state: GameState, action: RecruitAction): ActionOutcome {
  if (state.time.actionPoints < ACTION_POINT_COST) return fail("no-action-points");

  const contact = state.contacts.find((c) => c.id === action.contactId);
  if (!contact) return fail("contact-not-found");
  if (contact.burned) return fail("contact-burned");

  switch (action.kind) {
    case "assess":
      return assess(state, contact);
    case "approach":
      return approach(state, contact);
    case "lever":
      return lever(state, contact, action.motivation);
    case "cultivate":
      return cultivate(state, contact);
    case "exchange":
      return exchange(state, contact, action.give, action.receive);
    case "favor":
      return favor(state, contact, action.resource);
  }
}

// --- individual actions -----------------------------------------------------

/** Reveal a contact's motivation and resources. Costs nothing but exposure. */
function assess(state: GameState, contact: Contact): ActionOutcome {
  const next = updateContact(spendAp(state), contact.id, (c) => ({ ...c, assessed: true }));
  return ok(raiseExposure(next, 1));
}

/** Build trust with diminishing returns; no suspicion. Requires prior assessment. */
function approach(state: GameState, contact: Contact): ActionOutcome {
  if (!contact.assessed) return fail("not-assessed");
  const gain = clamp(10 - Math.floor(contact.trust / 20) * 2, 2, 10);
  return ok(commitTrust(spendAp(state), contact.id, { trustDelta: gain }));
}

/**
 * Pull a motivation lever. A matched lever (motivation === dominant) is the
 * efficient trust path; a mismatch barely moves trust and spikes suspicion.
 * Costs: money -> capital, need -> information (intel-backed leverage).
 */
function lever(state: GameState, contact: Contact, motivation: MotivationKind): ActionOutcome {
  if (!contact.assessed) return fail("not-assessed");

  const cost = leverCost(motivation);
  if (cost && state.treasury[cost] < 1) return fail("unaffordable");

  const matched = motivation === contact.motivation.dominant;
  const isNeedMismatch = !matched && contact.motivation.dominant === "need";

  const trustDelta = matched ? Math.round(20 * (0.8 + state.reputation / 250)) : 2;
  const suspicionDelta = matched ? 2 : isNeedMismatch ? 14 : 8;
  const exposureDelta = matched ? 2 : isNeedMismatch ? 10 : 4;

  let next = spendAp(state);
  if (cost) next = { ...next, treasury: { ...next.treasury, [cost]: next.treasury[cost] - 1 } };
  next = raiseExposure(next, exposureDelta);
  // exactOptionalPropertyTypes: omit landedLever entirely on a mismatch rather
  // than assigning undefined (a present-undefined key would be a type error).
  const change: TrustChange = matched
    ? { trustDelta, suspicionDelta, landedLever: motivation }
    : { trustDelta, suspicionDelta };
  next = commitTrust(next, contact.id, change);
  return ok(next);
}

/** Deepen the relationship; counts toward the red gate while the contact is yellow. */
function cultivate(state: GameState, contact: Contact): ActionOutcome {
  const tickBonus = contact.zone === "yellow" ? 1 : 0;
  const next = commitTrust(spendAp(state), contact.id, {
    trustDelta: 4,
    cultivateTickDelta: tickBonus,
  });
  return ok(next);
}

/** Báš-na-báš: give one treasury unit, receive one the contact holds. Yellow/red. */
function exchange(
  state: GameState,
  contact: Contact,
  give: ResourceKind,
  receive: ResourceKind,
): ActionOutcome {
  if (contact.zone !== "yellow" && contact.zone !== "red") return fail("wrong-zone");
  // give === receive is a degenerate swap: the treasury object literal below would
  // collapse the two computed keys and silently net +1 (free duplication). Reject it.
  if (give === receive) return fail("resource-unavailable");
  if (state.treasury[give] < 1) return fail("unaffordable");
  if (contact.resources[receive] < 1) return fail("resource-unavailable");

  let next = spendAp(state);
  next = {
    ...next,
    treasury: {
      ...next.treasury,
      [give]: next.treasury[give] - 1,
      [receive]: next.treasury[receive] + 1,
    },
  };
  next = updateContact(next, contact.id, (c) => ({
    ...c,
    resources: { ...c.resources, [receive]: c.resources[receive] - 1 },
    lastContactWeek: state.time.week,
  }));
  return ok(next);
}

/** Draw one unit of a held resource from a red-zone contact; 2-week cooldown. */
function favor(state: GameState, contact: Contact, resource: ResourceKind): ActionOutcome {
  if (contact.zone !== "red") return fail("wrong-zone");
  if (contact.cooldowns.favor > 0) return fail("on-cooldown");
  if (contact.resources[resource] < 1) return fail("resource-unavailable");

  let next = spendAp(state);
  next = { ...next, treasury: { ...next.treasury, [resource]: next.treasury[resource] + 1 } };
  next = updateContact(next, contact.id, (c) => ({
    ...c,
    resources: { ...c.resources, [resource]: c.resources[resource] - 1 },
    trust: clamp100(c.trust - 2),
    cooldowns: { ...c.cooldowns, favor: FAVOR_COOLDOWN_WEEKS },
    lastContactWeek: state.time.week,
  }));
  return ok(next);
}

// --- shared mechanics -------------------------------------------------------

function spendAp(state: GameState): GameState {
  return {
    ...state,
    time: { ...state.time, actionPoints: state.time.actionPoints - ACTION_POINT_COST },
  };
}

function raiseExposure(state: GameState, delta: number): GameState {
  return { ...state, exposure: clamp100(state.exposure + delta) };
}

function leverCost(motivation: MotivationKind): ResourceKind | undefined {
  if (motivation === "money") return "capital";
  if (motivation === "need") return "information";
  return undefined; // vision / ego are free
}

interface TrustChange {
  readonly trustDelta: number;
  readonly suspicionDelta?: number;
  readonly cultivateTickDelta?: number;
  readonly landedLever?: MotivationKind;
}

/**
 * Apply a trust/suspicion change to one contact, then settle consequences:
 * mark `lastContactWeek`, burn if suspicion maxes out (with neighbor contagion),
 * and promote + ripple edge valence if the contact now qualifies for a higher zone.
 */
function commitTrust(state: GameState, id: ContactId, change: TrustChange): GameState {
  const after = updateContact(state, id, (c) => {
    const updated: Contact = {
      ...c,
      trust: clamp100(c.trust + change.trustDelta),
      suspicion: clamp100(c.suspicion + (change.suspicionDelta ?? 0)),
      cultivateTicks: c.cultivateTicks + (change.cultivateTickDelta ?? 0),
      lastContactWeek: state.time.week,
    };
    return change.landedLever !== undefined
      ? { ...updated, landedLever: change.landedLever }
      : updated;
  });

  const contact = after.contacts.find((c) => c.id === id);
  if (!contact) return after;

  if (contact.suspicion >= SUSPICION_BURN_THRESHOLD) return burn(after, contact);
  if (qualifiesForPromotion(contact)) return promote(after, contact);
  return after;
}

/** Burn a contact: mark burned, ripple suspicion to neighbors, raise global exposure. */
function burn(state: GameState, contact: Contact): GameState {
  let next = updateContact(state, contact.id, (c) => ({ ...c, burned: true }));
  for (const edge of contact.edges) {
    const bump = Math.round(10 * Math.abs(edge.weight));
    next = updateContact(next, edge.to, (n) => ({ ...n, suspicion: clamp100(n.suspicion + bump) }));
  }
  return raiseExposure(next, 8);
}

/**
 * Promote a contact to the zone it now qualifies for, then ripple trust to its
 * neighbors by edge valence (allies gain, rivals lose). Entering yellow resets
 * cultivate ticks so the red gate counts only ticks accrued *while* yellow.
 */
function promote(state: GameState, contact: Contact): GameState {
  const target = highestQualifiedZone(contact);
  let next = updateContact(state, contact.id, (c) => ({
    ...c,
    zone: target,
    cultivateTicks: target === "yellow" ? 0 : c.cultivateTicks,
  }));

  for (const edge of contact.edges) {
    const delta = edgeRippleDelta(edge.valence, edge.weight);
    if (delta === 0) continue;
    next = updateContact(next, edge.to, (n) => ({ ...n, trust: clamp100(n.trust + delta) }));
  }
  return next;
}

function edgeRippleDelta(valence: Contact["edges"][number]["valence"], weight: number): number {
  const sign = valence === "ally" ? 1 : valence === "rival" ? -1 : 0;
  return sign * Math.round(weight * 5);
}

/** Per-zone availability hint for the UI (PR #4) to enable/disable action buttons. */
export function actionAvailableInZone(kind: RecruitActionKind, zone: Zone): boolean {
  if (kind === "favor") return zone === "red";
  if (kind === "exchange") return zone === "yellow" || zone === "red";
  return true;
}
