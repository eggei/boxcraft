// The coding agent's client: one call to any chat API that speaks the
// OpenAI "chat completions" format.
//
// Nothing here names a provider. The address comes from the person's setup and
// the rest is the common shape — a bearer key, a `messages` array, a
// `choices[0].message.content` reply, `usage.total_tokens`, and (where an API
// offers it) `x-ratelimit-*-requests` headers. An API that speaks something
// else entirely will fail here with a message saying so; that is the one
// constraint on "any API".

import { endpointHost } from "./aiSettings";
import { NO_RATE_LIMIT, type RateLimitInfo } from "./usage";
import type { ModelMessage } from "./prompt";

/** What the UI calls whatever is on the other end of the URL. */
export const AGENT_NAME = "The coding agent";

export type AiErrorKind =
  | "auth"
  | "rate-limit"
  | "network"
  | "model"
  | "too-large"
  | "server"
  | "cancelled"
  | "bad-response"
  | "other";

export class AiRequestError extends Error {
  kind: AiErrorKind;
  rateLimit: RateLimitInfo;

  constructor(kind: AiErrorKind, message: string, rateLimit: RateLimitInfo = NO_RATE_LIMIT) {
    super(message);
    this.name = "AiRequestError";
    this.kind = kind;
    this.rateLimit = rateLimit;
  }
}

export interface CompletionRequest {
  /** The full chat-completions address; see `chatEndpoint`. */
  endpoint: string;
  /** Empty means send no credentials at all. */
  apiKey: string;
  model: string;
  messages: ModelMessage[];
  maxTokens: number;
  signal?: AbortSignal;
}

export interface CompletionResult {
  content: string;
  finishReason: string | null;
  /** Tokens the call cost, prompt and reply together, when the API says. */
  totalTokens: number | null;
  rateLimit: RateLimitInfo;
}

/** `"2m59.56s"`, `"7.66s"`, `"1h2m"`, `"250ms"` → milliseconds. */
export function parseDuration(text: string | null): number | null {
  if (!text) return null;
  const UNIT_MS: Record<string, number> = {
    ms: 1,
    s: 1_000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
  };
  let total = 0;
  let matched = false;
  // `ms` is listed before `m` and `s` so "250ms" isn't read as 250 minutes.
  for (const [, amount, unit] of text.matchAll(/(\d+(?:\.\d+)?)(ms|s|m|h|d)/g)) {
    total += Number(amount) * UNIT_MS[unit];
    matched = true;
  }
  return matched ? Math.round(total) : null;
}

function headerNumber(headers: Headers, name: string): number | null {
  const raw = headers.get(name);
  if (raw === null || raw.trim() === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

/**
 * What the response headers said about the request allowance, using the
 * `x-ratelimit-*-requests` names several APIs share. The window they describe
 * is whatever the API's is — a minute, a day — which is why the readout speaks
 * of requests "left" and never "today".
 *
 * A browser only sees headers the server lists as exposed to cross-origin
 * pages. If these aren't exposed the fields come back null and the usage
 * readout falls back to counting — see reportUsage.
 */
export function parseRateLimitHeaders(headers: Headers): RateLimitInfo {
  const limit = headerNumber(headers, "x-ratelimit-limit-requests");
  const remaining = headerNumber(headers, "x-ratelimit-remaining-requests");
  const reset = parseDuration(headers.get("x-ratelimit-reset-requests"));
  const retryAfter = headerNumber(headers, "retry-after");

  return {
    requests:
      limit !== null && limit > 0 && remaining !== null
        ? { limit, remaining, resetMs: reset ?? 0 }
        : null,
    retryAfterMs: retryAfter === null ? null : Math.round(retryAfter * 1_000),
  };
}

// By name, not `instanceof DOMException`: the exception an aborted fetch throws
// can come from a different realm than the global (jsdom, for one).
function isAbort(error: unknown): boolean {
  return (error as { name?: unknown } | null)?.name === "AbortError";
}

/** The API's own explanation, when the body has one. */
function apiMessage(body: unknown): string | null {
  const error = (body as { error?: { message?: unknown } | string } | null)?.error;
  const message = typeof error === "string" ? error : error?.message;
  return typeof message === "string" && message.trim() !== "" ? message.trim() : null;
}

function failureFor(
  status: number,
  body: unknown,
  rateLimit: RateLimitInfo,
  request: CompletionRequest,
): AiRequestError {
  const detail = apiMessage(body);
  const host = endpointHost(request.endpoint);

  if (status === 401 || status === 403) {
    return new AiRequestError(
      "auth",
      request.apiKey
        ? `${AGENT_NAME} at ${host} didn't accept the API key. Check it in the coding agent setup.`
        : `${AGENT_NAME} at ${host} refused the request. It may need an API key — add one in the coding agent setup.`,
      rateLimit,
    );
  }
  if (status === 404 || (status === 400 && /model/i.test(detail ?? ""))) {
    return new AiRequestError(
      "model",
      status === 404 && !/model/i.test(detail ?? "")
        ? `Nothing answered at ${request.endpoint}. Check the API URL and the model name in the coding agent setup.`
        : `${detail ?? "That model isn’t available."} Check the model name in the coding agent setup.`,
      rateLimit,
    );
  }
  if (status === 413) {
    return new AiRequestError(
      "too-large",
      `This scene is too large for ${host}'s request limit.`,
      rateLimit,
    );
  }
  if (status === 429) {
    return new AiRequestError(
      "rate-limit",
      detail ?? `${AGENT_NAME} says a usage limit has been reached for now.`,
      rateLimit,
    );
  }
  if (status >= 500) {
    return new AiRequestError(
      "server",
      `${AGENT_NAME} at ${host} is having trouble right now (HTTP ${status}). Try again in a moment.`,
      rateLimit,
    );
  }
  return new AiRequestError(
    "other",
    detail ?? `${AGENT_NAME} at ${host} rejected the request (HTTP ${status}).`,
    rateLimit,
  );
}

/**
 * Two ways to say "stop after this many tokens". `max_tokens` is the one nearly
 * every compatible server knows, so it goes first; newer reasoning models
 * refuse it, and refuse a custom temperature, and want `max_completion_tokens`.
 * The second is only tried when the API's own reply says the first was the
 * problem — see `objectsToParameters`.
 */
function bodyFor(request: CompletionRequest, variant: 0 | 1): string {
  const common = { model: request.model, messages: request.messages, stream: false };
  return JSON.stringify(
    variant === 0
      ? { ...common, max_tokens: request.maxTokens, temperature: 0.2 }
      : { ...common, max_completion_tokens: request.maxTokens },
  );
}

/** Whether a 400 is the API objecting to a parameter we sent, not to the request. */
function objectsToParameters(status: number, body: unknown): boolean {
  return (
    status === 400 &&
    /max_tokens|max_completion_tokens|temperature|unsupported (parameter|value)|not supported/i.test(
      apiMessage(body) ?? "",
    )
  );
}

interface Attempt {
  response: Response;
  body: unknown;
  rateLimit: RateLimitInfo;
}

async function post(request: CompletionRequest, variant: 0 | 1): Promise<Attempt> {
  const host = endpointHost(request.endpoint);
  let response: Response;
  try {
    response = await fetch(request.endpoint, {
      method: "POST",
      signal: request.signal,
      headers: {
        "Content-Type": "application/json",
        ...(request.apiKey ? { Authorization: `Bearer ${request.apiKey}` } : {}),
      },
      body: bodyFor(request, variant),
    });
  } catch (error) {
    if (isAbort(error)) throw new AiRequestError("cancelled", "Cancelled.");
    // A blocked cross-origin call and a dead connection look identical to a
    // page, and with an arbitrary API the former is the likelier.
    throw new AiRequestError(
      "network",
      `Couldn't reach ${host}. Check the API URL and your connection. ` +
        `The API must also allow requests from a web page (CORS); some don't.`,
    );
  }

  const rateLimit = parseRateLimitHeaders(response.headers);
  let body: unknown = null;
  try {
    body = await response.json();
  } catch (error) {
    if (isAbort(error)) throw new AiRequestError("cancelled", "Cancelled.", rateLimit);
    // Anything else: not JSON. The status decides what that means.
  }
  return { response, body, rateLimit };
}

/** Reply text from either shape APIs use: a string, or a list of text parts. */
function contentOf(message: unknown): string | null {
  const content = (message as { content?: unknown } | null)?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const parts = content.flatMap((part) => {
      const text = (part as { text?: unknown } | null)?.text;
      return typeof text === "string" ? [text] : [];
    });
    return parts.length > 0 ? parts.join("") : null;
  }
  return null;
}

/**
 * One non-streaming chat completion. A scene is small and the whole reply is
 * needed before anything can be applied, so there is nothing to gain from
 * streaming it — and the rate-limit headers arrive with the response either way.
 */
export async function createChatCompletion(request: CompletionRequest): Promise<CompletionResult> {
  let attempt = await post(request, 0);
  if (!attempt.response.ok && objectsToParameters(attempt.response.status, attempt.body)) {
    attempt = await post(request, 1);
  }

  const { response, body, rateLimit } = attempt;
  if (!response.ok) throw failureFor(response.status, body, rateLimit, request);

  const parsed = body as {
    choices?: { message?: unknown; finish_reason?: unknown }[];
    usage?: { total_tokens?: unknown };
  } | null;
  const choice = parsed?.choices?.[0];
  const content = contentOf(choice?.message);
  if (content === null) {
    throw new AiRequestError(
      "bad-response",
      `${AGENT_NAME} at ${endpointHost(request.endpoint)} sent a reply in a format this app doesn't ` +
        `understand. It needs to be an OpenAI-compatible chat API.`,
      rateLimit,
    );
  }

  const total = parsed?.usage?.total_tokens;
  return {
    content,
    finishReason: typeof choice?.finish_reason === "string" ? choice.finish_reason : null,
    totalTokens: typeof total === "number" ? total : null,
    rateLimit,
  };
}
