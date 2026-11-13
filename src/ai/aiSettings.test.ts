import { describe, expect, it } from "vitest";
import {
  DEFAULT_AI_SETTINGS,
  applySetup,
  chatEndpoint,
  endpointHost,
  isConfigured,
  keyCarriesOver,
  maskKey,
  parseAiSettings,
  parseAllowance,
  serializeAiSettings,
  validateApiUrl,
  type AiSettings,
} from "./aiSettings";

const SETUP: AiSettings = {
  apiUrl: "https://agent.example.test/v1",
  apiKey: "sk-abcdefghij1234",
  model: "some-model",
  dailyRequestAllowance: 500,
  dailyTokenAllowance: 50_000,
};

describe("validateApiUrl", () => {
  it("accepts an https address", () => {
    expect(validateApiUrl("https://agent.example.test/v1")).toBeNull();
  });

  it("asks for something when the field is empty", () => {
    expect(validateApiUrl("   ")).toMatch(/Enter the API URL/);
  });

  it("rejects text that is not an address", () => {
    expect(validateApiUrl("agent.example.test/v1")).toMatch(/web address/);
    expect(validateApiUrl("not a url")).toMatch(/web address/);
  });

  it("refuses plain http to a remote host, where the key could be read in transit", () => {
    expect(validateApiUrl("http://agent.example.test/v1")).toMatch(/https/);
  });

  it("allows plain http on this machine, for a locally run model", () => {
    expect(validateApiUrl("http://localhost:11434/v1")).toBeNull();
    expect(validateApiUrl("http://127.0.0.1:8080/v1")).toBeNull();
    expect(validateApiUrl("http://[::1]:8080/v1")).toBeNull();
  });

  it("does not mistake a lookalike host for this machine", () => {
    expect(validateApiUrl("http://localhost.example.test/v1")).toMatch(/https/);
    // Ends in "localhost" without being a subdomain of it.
    expect(validateApiUrl("http://notlocalhost/v1")).toMatch(/https/);
    expect(validateApiUrl("http://evil-localhost.test/v1")).toMatch(/https/);
    expect(validateApiUrl("http://127.0.0.1.example.test/v1")).toMatch(/https/);
  });

  it("does allow a subdomain of localhost, which also stays on this machine", () => {
    expect(validateApiUrl("http://agent.localhost:8080/v1")).toBeNull();
  });

  it("refuses other schemes outright", () => {
    expect(validateApiUrl("javascript:alert(1)")).not.toBeNull();
    expect(validateApiUrl("ftp://agent.example.test/v1")).not.toBeNull();
  });
});

describe("chatEndpoint", () => {
  it("adds the completions path to a base URL", () => {
    expect(chatEndpoint("https://agent.example.test/v1")).toBe(
      "https://agent.example.test/v1/chat/completions",
    );
  });

  it("copes with a trailing slash", () => {
    expect(chatEndpoint("https://agent.example.test/v1/")).toBe(
      "https://agent.example.test/v1/chat/completions",
    );
  });

  it("leaves a full endpoint as it is, so pasting either form works", () => {
    expect(chatEndpoint("https://agent.example.test/v1/chat/completions")).toBe(
      "https://agent.example.test/v1/chat/completions",
    );
    expect(chatEndpoint("https://agent.example.test/v1/chat/completions/")).toBe(
      "https://agent.example.test/v1/chat/completions",
    );
  });

  it("works from a bare host", () => {
    expect(chatEndpoint("https://agent.example.test")).toBe(
      "https://agent.example.test/chat/completions",
    );
  });

  it("keeps a query string some APIs need", () => {
    expect(chatEndpoint("https://agent.example.test/v1?version=2")).toBe(
      "https://agent.example.test/v1/chat/completions?version=2",
    );
  });

  it("has no address for one that is not usable", () => {
    expect(chatEndpoint("http://agent.example.test/v1")).toBeNull();
    expect(chatEndpoint("")).toBeNull();
  });
});

describe("endpointHost", () => {
  it("names where a call went", () => {
    expect(endpointHost("https://agent.example.test:8443/v1/chat/completions")).toBe(
      "agent.example.test:8443",
    );
  });
});

describe("isConfigured", () => {
  it("needs a usable URL and a model — and not a key, which some APIs do without", () => {
    expect(isConfigured({ ...SETUP, apiKey: "" })).toBe(true);
    expect(isConfigured(SETUP)).toBe(true);
  });

  it("is false without either of the two", () => {
    expect(isConfigured({ ...SETUP, apiUrl: "" })).toBe(false);
    expect(isConfigured({ ...SETUP, model: "  " })).toBe(false);
    expect(isConfigured(DEFAULT_AI_SETTINGS)).toBe(false);
  });
});

describe("parseAiSettings", () => {
  it("starts empty: there is no default agent", () => {
    expect(parseAiSettings(null)).toEqual(DEFAULT_AI_SETTINGS);
    expect(DEFAULT_AI_SETTINGS.apiUrl).toBe("");
    expect(DEFAULT_AI_SETTINGS.model).toBe("");
  });

  it("round-trips what was stored", () => {
    expect(parseAiSettings(serializeAiSettings(SETUP))).toEqual(SETUP);
  });

  it("falls back to the defaults for a blob that is not settings at all", () => {
    expect(parseAiSettings("not json")).toEqual(DEFAULT_AI_SETTINGS);
    expect(parseAiSettings('"sk-abc"')).toEqual(DEFAULT_AI_SETTINGS);
  });

  it("keeps the fields it understands when others are mangled", () => {
    const parsed = parseAiSettings(
      JSON.stringify({ ...SETUP, model: 42, dailyTokenAllowance: "lots" }),
    );

    expect(parsed).toMatchObject({ apiUrl: SETUP.apiUrl, apiKey: SETUP.apiKey, model: "" });
    expect(parsed.dailyTokenAllowance).toBeNull();
    expect(parsed.dailyRequestAllowance).toBe(500);
  });

  it("trims the whitespace a paste tends to carry along", () => {
    const parsed = parseAiSettings(
      JSON.stringify({
        apiUrl: " https://agent.example.test/v1\n",
        apiKey: " sk-1 ",
        model: " m ",
      }),
    );

    expect(parsed).toMatchObject({
      apiUrl: "https://agent.example.test/v1",
      apiKey: "sk-1",
      model: "m",
    });
  });

  it("drops a key that has no usable URL to go to", () => {
    // What an earlier version stored: a key and a model, no address.
    const parsed = parseAiSettings(JSON.stringify({ apiKey: "sk-old", model: "m" }));

    expect(parsed.apiKey).toBe("");
    expect(parsed.model).toBe("m");
  });

  it("rejects nonsense allowances rather than trusting them", () => {
    const parsed = parseAiSettings(
      JSON.stringify({ ...SETUP, dailyRequestAllowance: -5, dailyTokenAllowance: 1.5 }),
    );

    expect(parsed.dailyRequestAllowance).toBeNull();
    expect(parsed.dailyTokenAllowance).toBeNull();
  });
});

describe("keyCarriesOver", () => {
  it("holds while the address stays on the same origin", () => {
    expect(
      keyCarriesOver("https://agent.example.test/v1", "https://agent.example.test/v2/other"),
    ).toBe(true);
  });

  it("does not survive a change of host", () => {
    expect(keyCarriesOver("https://agent.example.test/v1", "https://other.example.test/v1")).toBe(
      false,
    );
  });

  it("does not survive a change of scheme or port either", () => {
    expect(
      keyCarriesOver("https://agent.example.test/v1", "https://agent.example.test:8443/v1"),
    ).toBe(false);
  });

  it("has nowhere to carry to from an unusable address", () => {
    expect(keyCarriesOver("", "https://agent.example.test/v1")).toBe(false);
  });
});

describe("applySetup", () => {
  const draft = {
    apiUrl: SETUP.apiUrl,
    typedKey: "",
    model: SETUP.model,
    dailyRequestAllowance: null,
    dailyTokenAllowance: null,
  };

  it("keeps the saved key when the field is left empty and the address is unchanged", () => {
    expect(applySetup(SETUP, { ...draft, model: "other-model" })).toMatchObject({
      apiKey: SETUP.apiKey,
      model: "other-model",
    });
  });

  it("replaces the key with a newly typed one", () => {
    expect(applySetup(SETUP, { ...draft, typedKey: "  sk-new  " }).apiKey).toBe("sk-new");
  });

  it("never sends the saved key somewhere new just because the URL was edited", () => {
    const moved = applySetup(SETUP, { ...draft, apiUrl: "https://other.example.test/v1" });

    expect(moved.apiKey).toBe("");
  });

  it("lets a new key through with a new address", () => {
    const moved = applySetup(SETUP, {
      ...draft,
      apiUrl: "https://other.example.test/v1",
      typedKey: "sk-other",
    });

    expect(moved).toMatchObject({ apiUrl: "https://other.example.test/v1", apiKey: "sk-other" });
  });

  it("takes the allowances as entered, including none", () => {
    expect(applySetup(SETUP, draft)).toMatchObject({
      dailyRequestAllowance: null,
      dailyTokenAllowance: null,
    });
  });
});

describe("parseAllowance", () => {
  it("reads a whole number, tolerating the separators people type", () => {
    expect(parseAllowance("1000")).toBe(1000);
    expect(parseAllowance(" 100,000 ")).toBe(100_000);
  });

  it('reads nothing as "not known"', () => {
    expect(parseAllowance("")).toBeNull();
    expect(parseAllowance("   ")).toBeNull();
  });

  it("flags whatever is not a positive whole number", () => {
    expect(parseAllowance("lots")).toBe("invalid");
    expect(parseAllowance("1.5")).toBe("invalid");
    expect(parseAllowance("-3")).toBe("invalid");
    expect(parseAllowance("0")).toBe("invalid");
  });
});

describe("maskKey", () => {
  it("shows just enough to tell keys apart", () => {
    const masked = maskKey("sk-abcdefghijklmnop1234");

    expect(masked).toBe("sk-a…1234");
    expect(masked).not.toContain("efghijkl");
  });

  it("gives a short key away not at all", () => {
    expect(maskKey("short")).toBe("••••");
    expect(maskKey("")).toBe("");
  });
});
