// Headless usage-accounting module for the AI editor.
//
// "How much have I got left?" can only be answered as far as something knows.
// Three sources are kept apart here and the report says which each figure is:
//
//  - what the API reports after a call (requests left) — exact as of that call;
//  - what this browser has counted (requests made, tokens spent in the last
//    day) — a fact about this browser, not about the account;
//  - what the person told us their plan allows — the only way "left" exists
//    for an API that reports nothing.
//
// A figure with none of those behind it is reported as unknown, never guessed:
// the module has no idea what any API's limits are. Pure: state in, state out,
// with the clock passed in.

const DAY_MS = 24 * 60 * 60 * 1000;

/** Upper bound on remembered calls, so storage can't grow without limit. */
const MAX_ENTRIES = 1_000;

/** A call made from this browser. */
export interface UsageEntry {
  at: number;
  tokens: number;
}

/** The API's own request counter, as of the last response it sent. */
export interface ProviderRequests {
  limit: number;
  remaining: number;
  observedAt: number;
  /** When the counter is back to full; after this `remaining` is stale. */
  fullAt: number;
}

export interface UsageState {
  /**
   * The API these counts were made against. Another API is another account, so
   * counts for one are never shown against another — see `forScope`.
   */
  scope: string;
  /** Calls made from this browser within the last day. */
  entries: UsageEntry[];
  provider: ProviderRequests | null;
  /** Set by a rate-limit refusal: no point asking again before this. */
  blockedUntil: number | null;
}

export const EMPTY_USAGE: UsageState = {
  scope: "",
  entries: [],
  provider: null,
  blockedUntil: null,
};

/** The counters for `scope`: these ones if they are for it, a blank slate if not. */
export function forScope(state: UsageState, scope: string): UsageState {
  return state.scope === scope ? state : { ...EMPTY_USAGE, scope };
}

/** What a response's rate-limit headers said, already parsed. */
export interface RateLimitInfo {
  requests: { limit: number; remaining: number; resetMs: number } | null;
  retryAfterMs: number | null;
}

export const NO_RATE_LIMIT: RateLimitInfo = { requests: null, retryAfterMs: null };

function prune(entries: UsageEntry[], now: number): UsageEntry[] {
  return entries.filter((entry) => now - entry.at < DAY_MS).slice(-MAX_ENTRIES);
}

function withProvider(
  state: UsageState,
  rateLimit: RateLimitInfo,
  now: number,
): ProviderRequests | null {
  if (!rateLimit.requests) return state.provider;
  const { limit, remaining, resetMs } = rateLimit.requests;
  return { limit, remaining, observedAt: now, fullAt: now + resetMs };
}

/** A completed call: one request and however many tokens it turned out to cost. */
export function recordCall(
  state: UsageState,
  call: { at: number; tokens: number | null; rateLimit: RateLimitInfo },
): UsageState {
  return {
    ...state,
    entries: prune(
      [...state.entries, { at: call.at, tokens: Math.max(0, call.tokens ?? 0) }],
      call.at,
    ),
    provider: withProvider(state, call.rateLimit, call.at),
    blockedUntil: null,
  };
}

/**
 * A call abandoned mid-flight. The API very likely counted it, but what it
 * cost in tokens is unknowable, so it is one request and no tokens.
 */
export function recordAbandoned(state: UsageState, at: number): UsageState {
  return recordCall(state, { at, tokens: 0, rateLimit: NO_RATE_LIMIT });
}

/** A refusal for going over a limit. Refused calls aren't charged. */
export function recordRateLimited(
  state: UsageState,
  refusal: { at: number; rateLimit: RateLimitInfo },
): UsageState {
  const wait = refusal.rateLimit.retryAfterMs ?? 60_000;
  return {
    ...state,
    entries: prune(state.entries, refusal.at),
    provider: withProvider(state, refusal.rateLimit, refusal.at),
    blockedUntil: refusal.at + wait,
  };
}

/** What the person says their plan allows per day. Null where they don't know. */
export interface Allowances {
  requests: number | null;
  tokens: number | null;
}

/** One counted figure, with what is left of it where anything knows. */
export interface Quota {
  /** Spent from this browser in the last day. */
  used: number;
  /** Null when neither the API nor the person's allowance says. */
  remaining: number | null;
  limit: number | null;
  /** `true` only when the API itself said so; `false` is worked out here. */
  exact: boolean;
}

export interface UsageReport {
  requests: Quota;
  tokens: Quota;
  /** Milliseconds until calls are worth trying again, or null. */
  blockedForMs: number | null;
  /** Share of the tightest known allowance still unspent, 0–1; null if none is known. */
  fractionLeft: number | null;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function reportUsage(state: UsageState, now: number, allowances: Allowances): UsageReport {
  const recent = prune(state.entries, now);
  const tokensUsed = recent.reduce((sum, entry) => sum + entry.tokens, 0);

  let requests: Quota;
  const provider = state.provider;
  if (provider && now < provider.fullAt) {
    // The API's number, less anything sent since it was read.
    const since = recent.filter((entry) => entry.at > provider.observedAt).length;
    requests = {
      used: recent.length,
      remaining: clamp(provider.remaining - since, 0, provider.limit),
      limit: provider.limit,
      exact: true,
    };
  } else if (provider) {
    // A reading old enough that the counter has refilled past it: back to full,
    // less what has been sent since — but no longer something the API told us.
    const since = recent.filter((entry) => entry.at > provider.fullAt).length;
    requests = {
      used: recent.length,
      remaining: clamp(provider.limit - since, 0, provider.limit),
      limit: provider.limit,
      exact: false,
    };
  } else if (allowances.requests !== null) {
    requests = {
      used: recent.length,
      remaining: clamp(allowances.requests - recent.length, 0, allowances.requests),
      limit: allowances.requests,
      exact: false,
    };
  } else {
    requests = { used: recent.length, remaining: null, limit: null, exact: false };
  }

  const tokens: Quota =
    allowances.tokens !== null
      ? {
          used: tokensUsed,
          remaining: clamp(allowances.tokens - tokensUsed, 0, allowances.tokens),
          limit: allowances.tokens,
          exact: false,
        }
      : { used: tokensUsed, remaining: null, limit: null, exact: false };

  const fractions = [requests, tokens].flatMap((quota) =>
    quota.remaining !== null && quota.limit !== null ? [quota.remaining / quota.limit] : [],
  );

  const blockedForMs =
    state.blockedUntil !== null && state.blockedUntil > now ? state.blockedUntil - now : null;

  return {
    requests,
    tokens,
    blockedForMs,
    fractionLeft: fractions.length > 0 ? Math.min(...fractions) : null,
  };
}

/** Storage key for the persisted counters. */
export const AI_USAGE_KEY = "boxcraft:ai-usage";

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** Read a stored blob defensively; anything unrecognisable is a fresh start. */
export function parseUsage(raw: string | null): UsageState {
  let stored: unknown;
  try {
    stored = raw === null ? null : JSON.parse(raw);
  } catch {
    return EMPTY_USAGE;
  }
  if (typeof stored !== "object" || stored === null) return EMPTY_USAGE;
  const { scope, entries, provider, blockedUntil } = stored as Record<string, unknown>;

  const cleanEntries: UsageEntry[] = Array.isArray(entries)
    ? entries.flatMap((entry): UsageEntry[] => {
        const { at, tokens } = (entry ?? {}) as Record<string, unknown>;
        return isFiniteNumber(at) && isFiniteNumber(tokens) ? [{ at, tokens }] : [];
      })
    : [];

  let cleanProvider: ProviderRequests | null = null;
  if (typeof provider === "object" && provider !== null) {
    const { limit, remaining, observedAt, fullAt } = provider as Record<string, unknown>;
    if (
      isFiniteNumber(limit) &&
      limit > 0 &&
      isFiniteNumber(remaining) &&
      isFiniteNumber(observedAt) &&
      isFiniteNumber(fullAt)
    ) {
      cleanProvider = { limit, remaining, observedAt, fullAt };
    }
  }

  return {
    scope: typeof scope === "string" ? scope : "",
    entries: cleanEntries.slice(-MAX_ENTRIES),
    provider: cleanProvider,
    blockedUntil: isFiniteNumber(blockedUntil) ? blockedUntil : null,
  };
}

export function serializeUsage(state: UsageState): string {
  return JSON.stringify(state);
}
