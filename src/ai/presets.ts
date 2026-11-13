// Walk-through data for the free coding agents the setup form can fill in.
//
// This is the only place in the AI editor that names a provider. The client,
// the settings and the usage accounting are all provider-blind; a guide here is
// just a set of values to drop into the form and the steps to get a key. Adding
// another free option is adding an entry to `FREE_GUIDES`.

export interface SetupGuide {
  /** Who runs it — shown in the form's "free option" section. */
  name: string;
  /** Where to sign in and create an API key. */
  keysUrl: string;
  /** Where the account's real limits are listed. */
  limitsUrl: string;
  /** Values that go into the form. The key is always the person's own. */
  apiUrl: string;
  model: string;
  /** Typical free-tier daily caps — a starting point, not a promise. */
  dailyRequestAllowance: number;
  dailyTokenAllowance: number;
}

export const FREE_GUIDES: SetupGuide[] = [
  {
    name: "Groq",
    keysUrl: "https://console.groq.com/keys",
    limitsUrl: "https://console.groq.com/settings/limits",
    apiUrl: "https://api.groq.com/openai/v1",
    model: "llama-3.3-70b-versatile",
    dailyRequestAllowance: 1_000,
    dailyTokenAllowance: 100_000,
  },
];
