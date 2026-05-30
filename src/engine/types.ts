// ============================================================================
// src/engine/types.ts — engine-core domain types (PR #2, design v2).
//
// Pure data only: no React/DOM/Tauri/IO, no clock or global random source. The
// whole tree is JSON-serializable (plain objects, arrays, finite-key Records,
// number/string/boolean — no Map/Set/class/function/Symbol) so GameState
// round-trips byte-identically for saves (PR #7). Immutability is expressed with
// explicit `readonly` fields + `readonly T[]`; ids are intersection brands.
//
// Collections are plain ordered arrays (not byId + parallel order array): one
// structure, deterministic order, no cross-structure invariant to desync. O(n)
// lookup is fine at the scenario's contact counts; a Map can be derived at a
// call site if a hot loop ever needs it.
// ============================================================================

/* ---- Exhaustiveness guard for discriminated-union switches ---- */
export function assertNever(x: never): never {
  throw new Error(`Unexpected variant: ${JSON.stringify(x)}`);
}

/* ---- Engine + save-schema versions ---- */
/** Bumped whenever the GameState shape changes; PR #7 gates save migrations on it. */
export const STATE_SCHEMA_VERSION = 1;
/** 12 weeks = 1 quarter. `quarter` is DERIVED from `week`, never stored. */
export const WEEKS_PER_QUARTER = 12;
/** Default action points granted each week (a scenario may override). */
export const ACTION_POINTS_PER_WEEK = 4;

/* ---- Branded ids (intersection brand + smart constructor) ---- */
export type ContactId = string & { readonly __brand: "ContactId" };
export type DealId = string & { readonly __brand: "DealId" };
/** Sectors are scenario-defined, so SectorId is a branded string, not a union. */
export type SectorId = string & { readonly __brand: "SectorId" };
export const asContactId = (raw: string): ContactId => raw as ContactId;
export const asDealId = (raw: string): DealId => raw as DealId;
export const asSectorId = (raw: string): SectorId => raw as SectorId;

/** Scenarios are a fixed, small set, so ScenarioId is a closed union: a typo is a
 *  compile error and PR #6 outcome dispatch can be exhaustive. */
export type ScenarioId = "the-contract";

/* ---- Finite resource vocabulary + finite-key pool (access yields number) ---- */
export type ResourceKind =
  | "capital"
  | "access"
  | "information"
  | "connections"
  | "influence"
  | "expertise"
  | "reputation";
export const RESOURCE_KINDS = [
  "capital",
  "access",
  "information",
  "connections",
  "influence",
  "expertise",
  "reputation",
] as const satisfies readonly ResourceKind[];
/** Treasury + per-contact holdings. Finite key => indexing is `number`, never undefined. */
export type ResourcePool = Readonly<Record<ResourceKind, number>>;

export type Zone = "white" | "blue" | "yellow" | "red";
export const ZONES = ["white", "blue", "yellow", "red"] as const satisfies readonly Zone[];

export type MotivationKind = "money" | "vision" | "need" | "ego";
export type Valence = "ally" | "neutral" | "rival";

/** exactOptionalPropertyTypes: optional keys mean ABSENT, never present-and-undefined.
 *  Helpers omit the key rather than assign undefined. */
export interface Motivation {
  readonly dominant: MotivationKind;
  readonly secondary?: MotivationKind;
  readonly needText?: string;
}

export interface Edge {
  readonly to: ContactId;
  readonly valence: Valence;
  readonly weight: number; // 0..1 relationship strength (semantics are PR#3+)
}

/* ---- Per-contact cooldowns: finite-key Record over the full recruitment-action
   vocabulary (=> number, no undefined guard). 0 = ready. Favor's 2-week cooldown
   (the bible's one explicit cooldown) has a home here. ---- */
export type CooldownKind =
  | "assess"
  | "approach"
  | "lever"
  | "cultivate"
  | "introduce"
  | "exchange"
  | "favor";
export const COOLDOWN_KINDS = [
  "assess",
  "approach",
  "lever",
  "cultivate",
  "introduce",
  "exchange",
  "favor",
] as const satisfies readonly CooldownKind[];
export type Cooldowns = Readonly<Record<CooldownKind, number>>; // weeks remaining

export interface Contact {
  readonly id: ContactId;
  readonly name: string;
  readonly role: string;
  readonly sector: SectorId;
  readonly zone: Zone;
  readonly trust: number; // 0..100
  readonly suspicion: number; // 0..100
  readonly loyalty: number; // 0..100
  readonly volatility: number; // 0..1
  readonly riskTolerance: number; // 0..1
  readonly motivation: Motivation;
  readonly resources: ResourcePool;
  readonly edges: readonly Edge[];
  readonly assessed: boolean;
  /** Which lever last landed (absent = none). Yellow gate = landedLever === motivation.dominant. */
  readonly landedLever?: MotivationKind;
  /** Cultivate ticks accrued while in the yellow zone; the red gate needs >= 3. */
  readonly cultivateTicks: number;
  readonly burned: boolean;
  readonly recruitedByRival: boolean;
  readonly cooldowns: Cooldowns;
  readonly lastContactWeek: number; // 0 = never contacted (week numbering starts at 1)
}

export interface Company {
  readonly cash: number;
  readonly weeklyBurn: number;
  readonly revenue: number;
  readonly productReadiness: number; // 0..1
  readonly teamCapacity: number;
  /** Business-facing reputation (sec 4.6) — DISTINCT from GameState.reputation (the operator's). */
  readonly marketReputation: number; // 0..100
  // runwayWeeks is DERIVED (state.ts selector), NOT stored.
}

/* ---- Deal: discriminated union on `stage`; the union is the single source and
   DealStage is derived from it. A failed bid lands in the `lost` terminal. ---- */
export interface DealRequirements {
  /** Partial: most deals gate only a subset of resource kinds. */
  readonly resources: Partial<Readonly<Record<ResourceKind, number>>>;
  readonly requiredContacts?: readonly ContactId[];
  readonly minNetworkInfluence?: number;
}
interface DealBase {
  readonly id: DealId;
  readonly name: string;
  readonly requirements: DealRequirements;
  readonly payoff: ResourcePool; // reward on win (resolution logic is PR#5)
}
export type Deal =
  | (DealBase & { readonly stage: "qualify" })
  | (DealBase & { readonly stage: "develop"; readonly progress: number }) // 0..1
  | (DealBase & { readonly stage: "bid"; readonly bidAmount: number })
  | (DealBase & { readonly stage: "win"; readonly closedWeek: number })
  | (DealBase & { readonly stage: "lost"; readonly closedWeek: number; readonly reason: string });
/** Single source of truth — cannot drift from the Deal union. */
export type DealStage = Deal["stage"];

export type GameStatus = "playing" | "won" | "lost";
/** Which lose condition fired (present only when status === 'lost'). */
export type LoseReason = "runway" | "exposure" | "rival";

/* ---- RNG state: a single int32, trivially serializable. Threaded explicitly. ---- */
export type RngState = number;

/* ---- Typed PLACEHOLDERS (shape fixed now; behavior in PR#6) ---- */
export type RivalStatus = "dormant" | "active" | "exposed";
export interface RivalState {
  readonly status: RivalStatus; // 'dormant' until PR#6 activates it
  readonly aggression: number; // 0..1, scenario-seeded
  readonly heat: number; // 0..100, rival's own exposure analogue
  readonly targetContactId?: ContactId; // exactOptional: absent when no target
  readonly recruitedContactIds: readonly ContactId[];
  readonly lastActedWeek: number; // 0 = never
}

export type GameEventKind =
  | "system"
  | "recruitment"
  | "deal"
  | "rival"
  | "exposure"
  | "consequence";
export interface GameEvent {
  readonly id: string; // deterministic sequential id assigned by addEvent
  readonly week: number;
  readonly kind: GameEventKind;
  readonly messageKey: string; // i18n key; UI resolves the string (PR#4/#6)
  readonly data?: Readonly<Record<string, string | number | boolean>>; // JSON-safe params
}
export type EventLog = readonly GameEvent[];

/* ---- Scenario win/lose objective (typed data for PR#6 outcome logic) ---- */
export interface WinConditions {
  readonly contractDealId: DealId; // this deal must reach the 'win' stage
  readonly minReputation: number; // operator reputation >= this
  readonly minProductReadiness: number; // company.productReadiness >= this
  readonly cashFlowPositive: boolean; // require revenue >= weeklyBurn
}
export interface LoseConditions {
  readonly exposureMax: number; // exposure >= this => lose (e.g. 100)
  readonly runwayMinWeeks: number; // runway <= this => lose (e.g. 0)
  readonly rivalWinsContract: boolean; // rival closing the contract first => lose
}

/* ---- Scenario config: AUTHORED, IMMUTABLE data. Referenced from GameState by id
   only (the full config is NOT copied into state -> small saves, PR#7). ---- */
export interface SectorDef {
  readonly id: SectorId;
  readonly nameKey: string; // i18n key
}
export interface ScenarioConfig {
  readonly id: ScenarioId;
  readonly version: number; // bump => incompatible saves rejected (PR#7)
  readonly nameKey: string;
  readonly sectors: readonly SectorDef[];
  readonly startingTreasury: ResourcePool;
  readonly startingCompany: Company;
  readonly seedContacts: readonly Contact[];
  readonly seedDeals: readonly Deal[];
  readonly startReputation: number; // default 50
  readonly actionPointsPerWeek: number; // default 4
  readonly rivalAggression: number; // 0..1 seed for RivalState.aggression
  readonly win: WinConditions;
  readonly lose: LoseConditions;
}

/* ---- The composed state. FLAT. Surfaces every i18n-bound scalar: week,
   quarter (derived), actionPoints, company.cash, runway (derived), exposure,
   reputation. Collections are plain ordered arrays. ---- */
export interface GameState {
  readonly time: {
    readonly week: number; // starts 1 (quarter is derived: ceil(week/12))
    readonly actionPoints: number; // refilled to scenario.actionPointsPerWeek each week
  };
  readonly treasury: ResourcePool;
  readonly contacts: readonly Contact[];
  readonly company: Company;
  readonly deals: readonly Deal[];
  readonly exposure: number; // 0..100, starts 0
  readonly reputation: number; // 0..100, starts 50 — the OPERATOR's reputation
  // (NOT a held resource, NOT company.marketReputation;
  //  this is the bid sigmoid's (reputation-50)/k input).
  readonly rngState: RngState; // RNG lives INSIDE state => saves replay identically
  readonly rival: RivalState;
  readonly eventLog: EventLog;
  readonly nextEventSeq: number; // monotonic source for deterministic event ids
  readonly scenarioId: ScenarioId; // reference into the caller-owned scenario registry
  readonly scenarioVersion: number; // ScenarioConfig.version at creation (PR#7 migration gate)
  readonly stateVersion: number; // = STATE_SCHEMA_VERSION at creation
  readonly status: GameStatus; // 'playing'
  readonly loseReason?: LoseReason; // present only when status === 'lost'
}
