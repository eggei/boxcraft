import { useCallback, useEffect, useState } from "react";
import {
  AI_USAGE_KEY,
  forScope,
  parseUsage,
  recordAbandoned,
  recordCall,
  recordRateLimited,
  reportUsage,
  serializeUsage,
  type Allowances,
  type RateLimitInfo,
  type UsageReport,
  type UsageState,
} from "./usage";

function readStored(): string | null {
  try {
    return localStorage.getItem(AI_USAGE_KEY);
  } catch {
    return null;
  }
}

function store(state: UsageState) {
  try {
    localStorage.setItem(AI_USAGE_KEY, serializeUsage(state));
  } catch {
    // ignore
  }
}

/**
 * What the chat records. `scope` is the API the call went to, captured when it
 * was sent: the setup can be changed while a reply is on its way, and that
 * reply still belongs to the API that sent it.
 */
export interface AiUsage {
  report: UsageReport;
  onCall: (scope: string, call: { tokens: number | null; rateLimit: RateLimitInfo }) => void;
  onRateLimited: (scope: string, rateLimit: RateLimitInfo) => void;
  onAbandoned: (scope: string) => void;
}

/**
 * React/storage adapter over the pure usage module. Counters persist, so the
 * readout is right when the editor is reopened rather than starting from a
 * full tank every visit — and they are kept per API (`scope`), so pointing the
 * editor at another one starts that one from nothing.
 */
export function useAiUsage(scope: string, allowances: Allowances): AiUsage {
  const [state, setState] = useState<UsageState>(function resolveInitial() {
    return parseUsage(readStored());
  });
  // Bumped when a rate-limit wait runs out, so the readout drops the warning
  // without waiting for the next interaction.
  const [, setTick] = useState(0);

  const update = useCallback(function update(
    at: string,
    change: (current: UsageState) => UsageState,
  ) {
    setState(function apply(current) {
      const next = change(forScope(current, at));
      store(next);
      return next;
    });
  }, []);

  const onCall = useCallback(
    (at: string, call: { tokens: number | null; rateLimit: RateLimitInfo }) =>
      update(at, (current) => recordCall(current, { at: Date.now(), ...call })),
    [update],
  );
  const onRateLimited = useCallback(
    (at: string, rateLimit: RateLimitInfo) =>
      update(at, (current) => recordRateLimited(current, { at: Date.now(), rateLimit })),
    [update],
  );
  const onAbandoned = useCallback(
    (at: string) => update(at, (current) => recordAbandoned(current, Date.now())),
    [update],
  );

  const report = reportUsage(forScope(state, scope), Date.now(), allowances);

  useEffect(
    function expireBlock() {
      if (report.blockedForMs === null) return;
      const timer = setTimeout(() => setTick((n) => n + 1), report.blockedForMs + 50);
      return () => clearTimeout(timer);
    },
    [report.blockedForMs],
  );

  return { report, onCall, onRateLimited, onAbandoned };
}
