import { describe, expect, it } from "vitest";
import {
  EMPTY_USAGE,
  NO_RATE_LIMIT,
  forScope,
  parseUsage,
  recordAbandoned,
  recordCall,
  recordRateLimited,
  reportUsage,
  serializeUsage,
  type Allowances,
  type RateLimitInfo,
  type UsageState,
} from "./usage";

const NOW = 1_700_000_000_000;
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

const NO_ALLOWANCES: Allowances = { requests: null, tokens: null };

function headers(limit: number, remaining: number, resetMs = 3 * MINUTE): RateLimitInfo {
  return { requests: { limit, remaining, resetMs }, retryAfterMs: null };
}

describe("with nothing known", () => {
  it("reports what it counted and refuses to invent what is left", () => {
    const report = reportUsage(EMPTY_USAGE, NOW, NO_ALLOWANCES);

    expect(report.requests).toEqual({ used: 0, remaining: null, limit: null, exact: false });
    expect(report.tokens).toEqual({ used: 0, remaining: null, limit: null, exact: false });
    expect(report.fractionLeft).toBeNull();
  });

  it("still counts what this browser has used", () => {
    let state: UsageState = EMPTY_USAGE;
    for (let i = 0; i < 3; i++) {
      state = recordCall(state, { at: NOW + i, tokens: 2_000, rateLimit: NO_RATE_LIMIT });
    }

    const report = reportUsage(state, NOW + 10, NO_ALLOWANCES);

    expect(report.requests).toMatchObject({ used: 3, remaining: null });
    expect(report.tokens).toMatchObject({ used: 6_000, remaining: null });
    expect(report.fractionLeft).toBeNull();
  });
});

describe("with allowances the person entered", () => {
  const allowances: Allowances = { requests: 200, tokens: 100_000 };

  it("works out what is left of them, marked as worked out rather than reported", () => {
    let state: UsageState = EMPTY_USAGE;
    for (let i = 0; i < 3; i++) {
      state = recordCall(state, { at: NOW + i, tokens: 2_000, rateLimit: NO_RATE_LIMIT });
    }

    const report = reportUsage(state, NOW + 10, allowances);

    expect(report.requests).toEqual({ used: 3, remaining: 197, limit: 200, exact: false });
    expect(report.tokens).toEqual({ used: 6_000, remaining: 94_000, limit: 100_000, exact: false });
  });

  it("lets one allowance stand alone", () => {
    const report = reportUsage(EMPTY_USAGE, NOW, { requests: null, tokens: 10_000 });

    expect(report.requests.remaining).toBeNull();
    expect(report.tokens.remaining).toBe(10_000);
    expect(report.fractionLeft).toBe(1);
  });

  it("never goes below zero", () => {
    const state = recordCall(EMPTY_USAGE, { at: NOW, tokens: 500_000, rateLimit: NO_RATE_LIMIT });

    expect(reportUsage(state, NOW, allowances).tokens.remaining).toBe(0);
  });

  it("stops counting after a day", () => {
    const state = recordCall(EMPTY_USAGE, { at: NOW, tokens: 50_000, rateLimit: NO_RATE_LIMIT });

    const report = reportUsage(state, NOW + 25 * HOUR, allowances);

    expect(report.tokens).toMatchObject({ used: 0, remaining: 100_000 });
    expect(report.requests).toMatchObject({ used: 0, remaining: 200 });
  });

  it("treats a call the API gave no token count for as free rather than guessing", () => {
    const state = recordCall(EMPTY_USAGE, { at: NOW, tokens: null, rateLimit: NO_RATE_LIMIT });

    expect(reportUsage(state, NOW, allowances).tokens.used).toBe(0);
  });

  it("reads the tighter allowance as what is left overall, which is often the tokens", () => {
    // 40 edits at ~2.4K tokens: plenty of requests left, few tokens.
    let state: UsageState = EMPTY_USAGE;
    for (let i = 0; i < 40; i++) {
      state = recordCall(state, { at: NOW + i, tokens: 2_400, rateLimit: NO_RATE_LIMIT });
    }

    const report = reportUsage(state, NOW + 100, { requests: 1_000, tokens: 100_000 });

    expect(report.requests.remaining).toBe(960);
    expect(report.tokens.remaining).toBe(4_000);
    expect(report.fractionLeft).toBeCloseTo(0.04);
  });
});

describe("when the API reports its own counters", () => {
  it("uses the API’s number, exactly, over ours and over any allowance", () => {
    const state = recordCall(EMPTY_USAGE, {
      at: NOW,
      tokens: 2_500,
      rateLimit: headers(1_000, 842),
    });

    const report = reportUsage(state, NOW + 1_000, { requests: 50, tokens: null });

    expect(report.requests).toEqual({ used: 1, remaining: 842, limit: 1_000, exact: true });
  });

  it("works with no allowance entered at all", () => {
    const state = recordCall(EMPTY_USAGE, { at: NOW, tokens: 1, rateLimit: headers(60, 59) });

    const report = reportUsage(state, NOW, NO_ALLOWANCES);

    expect(report.requests.remaining).toBe(59);
    expect(report.fractionLeft).toBeCloseTo(59 / 60);
  });

  it("takes the latest reading over an earlier one", () => {
    let state = recordCall(EMPTY_USAGE, { at: NOW, tokens: 1, rateLimit: headers(1_000, 842) });
    state = recordCall(state, { at: NOW + 5_000, tokens: 1, rateLimit: headers(1_000, 841) });

    expect(reportUsage(state, NOW + 6_000, NO_ALLOWANCES).requests.remaining).toBe(841);
  });

  it("subtracts calls made since the reading that it can’t have seen", () => {
    let state = recordCall(EMPTY_USAGE, { at: NOW, tokens: 1, rateLimit: headers(1_000, 842) });
    state = recordAbandoned(state, NOW + 10_000);

    expect(reportUsage(state, NOW + 11_000, NO_ALLOWANCES).requests.remaining).toBe(841);
  });

  it("stops trusting the reading once the counter has refilled past it", () => {
    const state = recordCall(EMPTY_USAGE, {
      at: NOW,
      tokens: 1,
      rateLimit: headers(1_000, 10, 3 * MINUTE),
    });

    const report = reportUsage(state, NOW + 10 * MINUTE, NO_ALLOWANCES);

    // Back to full, but no longer something the API told us.
    expect(report.requests).toMatchObject({ remaining: 1_000, limit: 1_000, exact: false });
  });
});

describe("rate-limit refusals", () => {
  it("block for as long as the API asked, then clear", () => {
    const state = recordRateLimited(EMPTY_USAGE, {
      at: NOW,
      rateLimit: { requests: null, retryAfterMs: 42_000 },
    });

    expect(reportUsage(state, NOW + 1_000, NO_ALLOWANCES).blockedForMs).toBe(41_000);
    expect(reportUsage(state, NOW + 43_000, NO_ALLOWANCES).blockedForMs).toBeNull();
  });

  it("assume a minute when the API didn’t say", () => {
    const state = recordRateLimited(EMPTY_USAGE, { at: NOW, rateLimit: NO_RATE_LIMIT });

    expect(reportUsage(state, NOW, NO_ALLOWANCES).blockedForMs).toBe(60_000);
  });

  it("are not charged as requests", () => {
    const state = recordRateLimited(EMPTY_USAGE, { at: NOW, rateLimit: NO_RATE_LIMIT });

    expect(reportUsage(state, NOW, NO_ALLOWANCES).requests.used).toBe(0);
  });

  it("lift as soon as a call goes through", () => {
    let state = recordRateLimited(EMPTY_USAGE, { at: NOW, rateLimit: NO_RATE_LIMIT });
    state = recordCall(state, { at: NOW + 1_000, tokens: 1, rateLimit: NO_RATE_LIMIT });

    expect(reportUsage(state, NOW + 2_000, NO_ALLOWANCES).blockedForMs).toBeNull();
  });
});

describe("scope", () => {
  it("keeps the counts of the API they were made against", () => {
    const state = forScope(
      recordCall(forScope(EMPTY_USAGE, "https://a.example.test/v1/chat/completions"), {
        at: NOW,
        tokens: 900,
        rateLimit: headers(100, 99),
      }),
      "https://a.example.test/v1/chat/completions",
    );

    expect(reportUsage(state, NOW, NO_ALLOWANCES).requests).toMatchObject({
      used: 1,
      remaining: 99,
    });
  });

  it("starts another API from nothing rather than showing it the first one’s numbers", () => {
    const a = recordCall(forScope(EMPTY_USAGE, "https://a.example.test/v1/chat/completions"), {
      at: NOW,
      tokens: 900,
      rateLimit: headers(100, 5),
    });

    const b = forScope(a, "https://b.example.test/v1/chat/completions");
    const report = reportUsage(b, NOW, NO_ALLOWANCES);

    expect(report.requests).toEqual({ used: 0, remaining: null, limit: null, exact: false });
    expect(report.tokens.used).toBe(0);
    expect(b.blockedUntil).toBeNull();
  });
});

describe("persistence", () => {
  it("round-trips", () => {
    const state = recordCall(forScope(EMPTY_USAGE, "https://a.example.test/v1/chat/completions"), {
      at: NOW,
      tokens: 900,
      rateLimit: headers(1_000, 99),
    });

    expect(parseUsage(serializeUsage(state))).toEqual(state);
  });

  it("starts fresh from anything that is not a usage blob", () => {
    expect(parseUsage(null)).toEqual(EMPTY_USAGE);
    expect(parseUsage("not json")).toEqual(EMPTY_USAGE);
    expect(parseUsage("[1,2]")).toEqual(EMPTY_USAGE);
  });

  it("keeps the well-formed parts of a damaged blob", () => {
    const parsed = parseUsage(
      JSON.stringify({
        scope: "https://a.example.test/v1/chat/completions",
        entries: [{ at: NOW, tokens: 5 }, { at: "yesterday" }, null],
        provider: { limit: 0, remaining: 1, observedAt: 1, fullAt: 2 },
        blockedUntil: "soon",
      }),
    );

    expect(parsed.entries).toEqual([{ at: NOW, tokens: 5 }]);
    expect(parsed.provider).toBeNull();
    expect(parsed.blockedUntil).toBeNull();
    expect(parsed.scope).toBe("https://a.example.test/v1/chat/completions");
  });

  it("treats a blob from before counts were scoped as belonging to no API", () => {
    const parsed = parseUsage(
      JSON.stringify({ entries: [{ at: NOW, tokens: 5 }], provider: null }),
    );

    expect(forScope(parsed, "https://a.example.test/v1/chat/completions").entries).toEqual([]);
  });
});
