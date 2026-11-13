import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AiRequestError,
  createChatCompletion,
  parseDuration,
  parseRateLimitHeaders,
} from "./agentClient";

const ENDPOINT = "https://agent.example.test/v1/chat/completions";
const REQUEST = {
  endpoint: ENDPOINT,
  apiKey: "sk-test",
  model: "some-model",
  messages: [{ role: "user" as const, content: "hi" }],
  maxTokens: 2048,
};

function reply(
  body: unknown,
  init: { status?: number; headers?: Record<string, string> } = {},
): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "content-type": "application/json", ...init.headers },
  });
}

const OK = { choices: [{ message: { content: "ok" }, finish_reason: "stop" }] };

/** The error a call rejects with; fails the test if it resolves or throws something else. */
async function failureOf(call: Promise<unknown>): Promise<AiRequestError> {
  const outcome = await call.then(
    () => null,
    (error: unknown) => error,
  );
  expect(outcome).toBeInstanceOf(AiRequestError);
  return outcome as AiRequestError;
}

function stubFetch(impl: (url: string, init: RequestInit) => Promise<Response>) {
  const fetchMock = vi.fn(impl);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

describe("parseDuration", () => {
  it("reads the compound durations APIs send", () => {
    expect(parseDuration("2m59.56s")).toBe(179_560);
    expect(parseDuration("7.66s")).toBe(7_660);
    expect(parseDuration("1h2m3s")).toBe(3_723_000);
  });

  it("does not mistake milliseconds for minutes", () => {
    expect(parseDuration("250ms")).toBe(250);
  });

  it("has no answer for what it cannot read", () => {
    expect(parseDuration(null)).toBeNull();
    expect(parseDuration("soon")).toBeNull();
  });
});

describe("parseRateLimitHeaders", () => {
  it("reads the request allowance and how long until it refills", () => {
    const parsed = parseRateLimitHeaders(
      new Headers({
        "x-ratelimit-limit-requests": "1000",
        "x-ratelimit-remaining-requests": "842",
        "x-ratelimit-reset-requests": "2m59.56s",
        "retry-after": "12",
      }),
    );

    expect(parsed).toEqual({
      requests: { limit: 1000, remaining: 842, resetMs: 179_560 },
      retryAfterMs: 12_000,
    });
  });

  it("reports nothing when the API sends none, or the browser may not see them", () => {
    expect(parseRateLimitHeaders(new Headers())).toEqual({ requests: null, retryAfterMs: null });
  });
});

describe("createChatCompletion", () => {
  it("posts to the address it was given, not one of its own", async () => {
    const fetchMock = stubFetch(async () => reply(OK));

    await createChatCompletion({
      ...REQUEST,
      endpoint: "http://localhost:11434/v1/chat/completions",
    });

    expect(fetchMock.mock.calls[0][0]).toBe("http://localhost:11434/v1/chat/completions");
  });

  it("sends the key as a bearer token and the conversation as the body", async () => {
    const fetchMock = stubFetch(async () => reply(OK));

    await createChatCompletion(REQUEST);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(ENDPOINT);
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer sk-test");
    expect(JSON.parse(init.body as string)).toMatchObject({
      model: "some-model",
      messages: REQUEST.messages,
      max_tokens: 2048,
      stream: false,
    });
  });

  it("sends no credentials at all when there is no key", async () => {
    const fetchMock = stubFetch(async () => reply(OK));

    await createChatCompletion({ ...REQUEST, apiKey: "" });

    const headers = fetchMock.mock.calls[0][1].headers as Record<string, string>;
    expect(Object.keys(headers).map((h) => h.toLowerCase())).not.toContain("authorization");
  });

  it("returns the reply with what it cost and what is left", async () => {
    stubFetch(async () =>
      reply(
        { ...OK, usage: { total_tokens: 2345 } },
        {
          headers: {
            "x-ratelimit-limit-requests": "1000",
            "x-ratelimit-remaining-requests": "999",
            "x-ratelimit-reset-requests": "86.4s",
          },
        },
      ),
    );

    const result = await createChatCompletion(REQUEST);

    expect(result).toEqual({
      content: "ok",
      finishReason: "stop",
      totalTokens: 2345,
      rateLimit: {
        requests: { limit: 1000, remaining: 999, resetMs: 86_400 },
        retryAfterMs: null,
      },
    });
  });

  it("reads a reply that arrives as a list of text parts", async () => {
    stubFetch(async () =>
      reply({
        choices: [
          {
            message: {
              content: [
                { type: "text", text: "Hello, " },
                { type: "text", text: "world" },
              ],
            },
          },
        ],
      }),
    );

    expect((await createChatCompletion(REQUEST)).content).toBe("Hello, world");
  });

  describe("when the API objects to a parameter", () => {
    it("retries once with the newer token-limit name and no temperature", async () => {
      const fetchMock = stubFetch(async (_url, init) => {
        const body = JSON.parse(init.body as string);
        return "max_tokens" in body
          ? reply(
              {
                error: {
                  message: "Unsupported parameter: 'max_tokens' is not supported with this model.",
                },
              },
              { status: 400 },
            )
          : reply(OK);
      });

      const result = await createChatCompletion(REQUEST);

      expect(result.content).toBe("ok");
      expect(fetchMock).toHaveBeenCalledTimes(2);
      const retried = JSON.parse(fetchMock.mock.calls[1][1].body as string);
      expect(retried).toMatchObject({ max_completion_tokens: 2048 });
      expect(retried).not.toHaveProperty("max_tokens");
      expect(retried).not.toHaveProperty("temperature");
    });

    it("gives up after that one retry rather than looping", async () => {
      const fetchMock = stubFetch(async () =>
        reply({ error: { message: "temperature is not supported" } }, { status: 400 }),
      );

      await expect(createChatCompletion(REQUEST)).rejects.toBeInstanceOf(AiRequestError);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("does not retry a 400 that was about something else", async () => {
      const fetchMock = stubFetch(async () =>
        reply({ error: { message: "messages: must be non-empty" } }, { status: 400 }),
      );

      await expect(createChatCompletion(REQUEST)).rejects.toMatchObject({ kind: "other" });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  async function failure(
    status: number,
    body: unknown,
    headers: Record<string, string> = {},
    req = REQUEST,
  ) {
    stubFetch(async () => reply(body, { status, headers }));
    return failureOf(createChatCompletion(req));
  }

  it("says the key was refused for a 401, naming the host that refused it", async () => {
    const error = await failure(401, { error: { message: "Invalid API Key" } });

    expect(error.kind).toBe("auth");
    expect(error.message).toMatch(/agent\.example\.test/);
    expect(error.message).toMatch(/didn't accept the API key/);
  });

  it("suggests a key may be needed when none was sent", async () => {
    const error = await failure(
      401,
      { error: { message: "Unauthorized" } },
      {},
      { ...REQUEST, apiKey: "" },
    );

    expect(error.kind).toBe("auth");
    expect(error.message).toMatch(/may need an API key/);
  });

  it("passes the API’s wording on for a 429, with when to retry", async () => {
    const error = await failure(
      429,
      { error: { message: "Rate limit reached. Try again in 7m." } },
      {
        "retry-after": "420",
        "x-ratelimit-remaining-requests": "0",
        "x-ratelimit-limit-requests": "1000",
      },
    );

    expect(error.kind).toBe("rate-limit");
    expect(error.message).toBe("Rate limit reached. Try again in 7m.");
    expect(error.rateLimit.retryAfterMs).toBe(420_000);
    expect(error.rateLimit.requests?.remaining).toBe(0);
  });

  it("points at the URL and the model for a bare 404", async () => {
    const error = await failure(404, { detail: "Not Found" });

    expect(error.kind).toBe("model");
    expect(error.message).toContain(ENDPOINT);
    expect(error.message).toMatch(/API URL and the model name/);
  });

  it("points at the model when the API says the model is missing", async () => {
    const error = await failure(404, { error: { message: "The model `nope` does not exist." } });

    expect(error.kind).toBe("model");
    expect(error.message).toMatch(/does not exist/);
  });

  it("understands an error body that is a plain string", async () => {
    const error = await failure(429, { error: "slow down" });

    expect(error.message).toBe("slow down");
  });

  it("calls a 5xx the agent’s trouble, not the user’s", async () => {
    const error = await failure(503, { error: { message: "overloaded" } });

    expect(error.kind).toBe("server");
    expect(error.message).toMatch(/503/);
  });

  it("survives an error body that is not JSON", async () => {
    stubFetch(async () => new Response("<html>bad gateway</html>", { status: 502 }));

    await expect(createChatCompletion(REQUEST)).rejects.toMatchObject({ kind: "server" });
  });

  it("explains a failed connection in terms of the URL and of CORS, the likely culprits", async () => {
    stubFetch(async () => {
      throw new TypeError("Failed to fetch");
    });

    const error = await failureOf(createChatCompletion(REQUEST));

    expect(error).toMatchObject({ kind: "network" });
    expect(error.message).toMatch(/agent\.example\.test/);
    expect(error.message).toMatch(/CORS/);
  });

  it("reports an abort as a cancellation, not a failure", async () => {
    stubFetch(async (_url, init) => {
      return new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener("abort", () =>
          reject(new DOMException("aborted", "AbortError")),
        );
      });
    });
    const controller = new AbortController();

    const pending = createChatCompletion({ ...REQUEST, signal: controller.signal });
    controller.abort();

    await expect(pending).rejects.toMatchObject({ kind: "cancelled" });
  });

  it("says what it needs when a 200 is not an OpenAI-style reply", async () => {
    stubFetch(async () => reply({ candidates: [{ content: "x" }] }));

    const error = await failureOf(createChatCompletion(REQUEST));

    expect(error).toMatchObject({ kind: "bad-response" });
    expect(error.message).toMatch(/OpenAI-compatible/);
  });
});
