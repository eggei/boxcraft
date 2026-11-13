// Headless coding-agent settings module.
//
// What the assistant needs to reach *some* chat API: where it lives, the key
// that opens it, and which model to ask for. Nothing here knows of any
// particular provider — the one free provider the app can walk a person
// through is data in presets.ts. Pure: parsing, validating and shaping values.
// Storage lives in the adapter hook, as the editor settings are arranged.

/** Storage key holding the setup, if the person has made one. */
export const AI_SETTINGS_KEY = "boxcraft:ai-settings";

export interface AiSettings {
  /** The API's address, as typed. Either its base URL or the full endpoint. */
  apiUrl: string;
  /** Empty for an API that needs none, such as a model on the person's machine. */
  apiKey: string;
  model: string;
  /** What the person's plan allows per day, if they know — drives "left". */
  dailyRequestAllowance: number | null;
  dailyTokenAllowance: number | null;
}

export const DEFAULT_AI_SETTINGS: AiSettings = {
  apiUrl: "",
  apiKey: "",
  model: "",
  dailyRequestAllowance: null,
  dailyTokenAllowance: null,
};

/** The path a chat API serves its completions from. */
const CHAT_PATH = "/chat/completions";

/** Loopback hosts, where plain http is fine: the key never leaves the machine. */
function isLoopback(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]"
  );
}

function parseUrl(text: string): URL | null {
  try {
    return new URL(text.trim());
  } catch {
    return null;
  }
}

/**
 * What is wrong with an API URL, in words meant for the form, or null when it
 * is usable. The key travels in a header to this address, so anything but https
 * is refused unless it stays on this machine.
 */
export function validateApiUrl(text: string): string | null {
  if (text.trim() === "") return "Enter the API URL.";
  const url = parseUrl(text);
  if (!url) return "That doesn’t look like a web address. It should start with https://";
  if (url.protocol === "https:") return null;
  if (url.protocol === "http:" && isLoopback(url.hostname)) return null;
  if (url.protocol === "http:") {
    return "Use https:// — an API key sent over plain http can be read on the way.";
  }
  return "The API URL must start with https://";
}

/**
 * The address requests are posted to. People find either the base URL
 * (`…/v1`) or the full endpoint in a provider's docs, so both are accepted and
 * the completions path is added when it isn't already there.
 */
export function chatEndpoint(apiUrl: string): string | null {
  if (validateApiUrl(apiUrl) !== null) return null;
  const url = parseUrl(apiUrl)!;
  const path = url.pathname.replace(/\/+$/, "");
  url.pathname = path.endsWith(CHAT_PATH) ? path : path + CHAT_PATH;
  url.hash = "";
  return url.toString();
}

/** The host part of the endpoint, for messages that name where a call went. */
export function endpointHost(endpoint: string): string {
  return parseUrl(endpoint)?.host ?? endpoint;
}

/** Whether there is enough to make a request: a usable URL and a model. */
export function isConfigured(settings: AiSettings): boolean {
  return validateApiUrl(settings.apiUrl) === null && settings.model.trim() !== "";
}

/**
 * Whether a saved key may be sent to `nextUrl`. A key belongs to the place it
 * was saved for: quietly handing it to a different host because the URL field
 * was edited (or a preset filled it in) would be a leak, so it only carries
 * over when the origin is unchanged.
 */
export function keyCarriesOver(savedUrl: string, nextUrl: string): boolean {
  const saved = parseUrl(savedUrl);
  const next = parseUrl(nextUrl);
  return !!saved && !!next && saved.origin === next.origin;
}

/** A daily allowance typed into the form: a whole number, or nothing. */
export function parseAllowance(text: string): number | null | "invalid" {
  const trimmed = text.trim().replace(/[,_\s]/g, "");
  if (trimmed === "") return null;
  if (!/^\d+$/.test(trimmed)) return "invalid";
  const value = Number(trimmed);
  return value > 0 && Number.isSafeInteger(value) ? value : "invalid";
}

function allowanceOf(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : null;
}

/**
 * Read a stored blob field by field, so one mangled value costs one default
 * rather than the whole setup. A key is only kept alongside a usable URL: one
 * with nowhere to go (an earlier version's, or a hand-edited blob's) is
 * dropped rather than left lying around for the next URL someone types.
 */
export function parseAiSettings(raw: string | null): AiSettings {
  let stored: unknown;
  try {
    stored = raw === null ? null : JSON.parse(raw);
  } catch {
    return DEFAULT_AI_SETTINGS;
  }
  if (typeof stored !== "object" || stored === null) return DEFAULT_AI_SETTINGS;

  const fields = stored as Partial<Record<keyof AiSettings, unknown>>;
  const apiUrl = typeof fields.apiUrl === "string" ? fields.apiUrl.trim() : "";
  const apiKey = typeof fields.apiKey === "string" ? fields.apiKey.trim() : "";
  return {
    apiUrl,
    apiKey: validateApiUrl(apiUrl) === null ? apiKey : "",
    model: typeof fields.model === "string" ? fields.model.trim() : "",
    dailyRequestAllowance: allowanceOf(fields.dailyRequestAllowance),
    dailyTokenAllowance: allowanceOf(fields.dailyTokenAllowance),
  };
}

export function serializeAiSettings(settings: AiSettings): string {
  return JSON.stringify(settings);
}

/**
 * The settings after the form is saved. `typedKey` is what was in the key
 * field: a new key replaces the saved one, an empty field keeps it only while
 * the URL still points where it was saved for.
 */
export function applySetup(
  saved: AiSettings,
  draft: Omit<AiSettings, "apiKey"> & { typedKey: string },
): AiSettings {
  const { typedKey, ...rest } = draft;
  const typed = typedKey.trim();
  return {
    ...rest,
    apiUrl: rest.apiUrl.trim(),
    model: rest.model.trim(),
    apiKey: typed !== "" ? typed : keyCarriesOver(saved.apiUrl, rest.apiUrl) ? saved.apiKey : "",
  };
}

/**
 * A key reduced to something safe to show: enough of its tail to recognise
 * which one is saved, nothing that would be worth copying off a screenshot.
 */
export function maskKey(apiKey: string): string {
  if (apiKey === "") return "";
  if (apiKey.length <= 8) return "••••";
  return `${apiKey.slice(0, 4)}…${apiKey.slice(-4)}`;
}
