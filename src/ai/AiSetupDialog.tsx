import { useId, useState } from "react";
import type { FormEvent, KeyboardEvent, ReactNode } from "react";
import { createPortal } from "react-dom";
import { ExternalLink } from "lucide-react";
import {
  applySetup,
  keyCarriesOver,
  maskKey,
  parseAllowance,
  validateApiUrl,
  type AiSettings,
} from "./aiSettings";
import { FREE_GUIDES, type SetupGuide } from "./presets";

interface AiSetupDialogProps {
  settings: AiSettings;
  /** Whether a working setup already exists — decides if the guide starts open. */
  configured: boolean;
  onSave: (settings: AiSettings) => void;
  onRemoveKey: () => void;
  onClose: () => void;
}

const INPUT =
  "border-input focus-visible:ring-ring w-full rounded-md border bg-transparent px-2 py-1.5 text-sm outline-none focus-visible:ring-[3px]";

/**
 * Where the person says which coding agent to talk to. Every field says what it
 * is and where to find it, because "API URL" means nothing to someone who has
 * only ever been handed a key — and a walk-through for one free option sits at
 * the top for the person who has nothing yet.
 *
 * It edits a draft and hands the whole setup back on Save; nothing changes
 * until then. The saved key is never put back into its field, so there is no
 * copy of it in the page to read off — the field only ever writes.
 */
export function AiSetupDialog({
  settings,
  configured,
  onSave,
  onRemoveKey,
  onClose,
}: AiSetupDialogProps) {
  const titleId = useId();
  const [apiUrl, setApiUrl] = useState(settings.apiUrl);
  const [typedKey, setTypedKey] = useState("");
  const [model, setModel] = useState(settings.model);
  const [requests, setRequests] = useState(settings.dailyRequestAllowance?.toString() ?? "");
  const [tokens, setTokens] = useState(settings.dailyTokenAllowance?.toString() ?? "");
  const [submitted, setSubmitted] = useState(false);

  const urlError = validateApiUrl(apiUrl);
  const modelError = model.trim() === "" ? "Enter the model name." : null;
  const requestsAllowance = parseAllowance(requests);
  const tokensAllowance = parseAllowance(tokens);
  const allowanceError =
    requestsAllowance === "invalid" || tokensAllowance === "invalid"
      ? "Use whole numbers, or leave both empty."
      : null;
  const valid = !urlError && !modelError && !allowanceError;

  // A saved key only travels to the address it was saved for.
  const hasSavedKey = settings.apiKey !== "";
  const keyStays = hasSavedKey && keyCarriesOver(settings.apiUrl, apiUrl);
  const keyPlaceholder = keyStays
    ? `Saved (${maskKey(settings.apiKey)}) — paste a new one to replace it`
    : hasSavedKey
      ? "The saved key is for a different URL and won’t be sent here"
      : "Leave empty if the API needs no key";

  function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitted(true);
    if (!valid) return;
    onSave(
      applySetup(settings, {
        apiUrl,
        typedKey,
        model,
        dailyRequestAllowance: requestsAllowance as number | null,
        dailyTokenAllowance: tokensAllowance as number | null,
      }),
    );
  }

  function fillIn(guide: SetupGuide) {
    setApiUrl(guide.apiUrl);
    setModel(guide.model);
    setRequests(String(guide.dailyRequestAllowance));
    setTokens(String(guide.dailyTokenAllowance));
  }

  function onKeyDown(event: KeyboardEvent) {
    // The dialog owns the keyboard while it is up, so the app's shortcuts
    // (Esc leaves the editor) can't fire from inside it.
    event.stopPropagation();
    if (event.key === "Escape") onClose();
  }

  return createPortal(
    <div className="fixed inset-0 z-30 grid place-items-center bg-black/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={onKeyDown}
        className="bg-background flex max-h-[90vh] w-full max-w-[540px] flex-col rounded-lg border shadow-lg"
      >
        <form onSubmit={submit} noValidate className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-4 overflow-auto p-5 text-sm">
            <div className="space-y-1.5">
              <h2 id={titleId} className="text-base font-semibold">
                Coding agent setup
              </h2>
              <p className="text-muted-foreground">
                The AI editor sends your request, and this scene’s code, to a coding agent: any chat
                API that follows the OpenAI “chat completions” format. Most providers offer one, and
                so do model servers you run yourself. You need three things from your provider’s
                dashboard or docs.
              </p>
            </div>

            {FREE_GUIDES.map((guide) => (
              <FreeGuide
                key={guide.name}
                guide={guide}
                startOpen={!configured}
                onFillIn={() => fillIn(guide)}
              />
            ))}

            <Field
              label="API URL"
              error={submitted ? urlError : null}
              hint={
                <>
                  Look for “base URL” or “endpoint” in your provider’s API docs; it usually ends in{" "}
                  <code>/v1</code>. For example <code>https://api.openai.com/v1</code>, or{" "}
                  <code>http://localhost:11434/v1</code> for a model on your own machine. The{" "}
                  <code>/chat/completions</code> part is added for you.
                </>
              }
            >
              {(id, describedBy) => (
                <input
                  id={id}
                  aria-describedby={describedBy}
                  aria-invalid={submitted && !!urlError}
                  type="url"
                  inputMode="url"
                  autoComplete="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  autoFocus
                  value={apiUrl}
                  onChange={(event) => setApiUrl(event.target.value)}
                  placeholder="https://…/v1"
                  className={INPUT}
                />
              )}
            </Field>

            <Field
              label="API key"
              hint={
                <>
                  Created in your provider’s dashboard, usually under “API keys”. It is saved in
                  this browser only and sent only to the API URL above. Leave it empty for an API
                  that needs none, such as a local model.
                </>
              }
            >
              {(id, describedBy) => (
                <input
                  id={id}
                  aria-describedby={describedBy}
                  type="password"
                  autoComplete="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  value={typedKey}
                  onChange={(event) => setTypedKey(event.target.value)}
                  placeholder={keyPlaceholder}
                  className={INPUT}
                />
              )}
            </Field>

            <Field
              label="Model"
              error={submitted ? modelError : null}
              hint={
                <>
                  The model’s name exactly as your provider lists it, in its model list or docs.
                  Providers retire models now and then; if replies start failing with “model not
                  found”, come back here.
                </>
              }
            >
              {(id, describedBy) => (
                <input
                  id={id}
                  aria-describedby={describedBy}
                  aria-invalid={submitted && !!modelError}
                  type="text"
                  autoComplete="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  value={model}
                  onChange={(event) => setModel(event.target.value)}
                  className={INPUT}
                />
              )}
            </Field>

            <fieldset className="space-y-1.5">
              <legend className="font-medium">
                Daily limits <span className="text-muted-foreground font-normal">(optional)</span>
              </legend>
              <p className="text-muted-foreground text-xs">
                If your plan caps how much you can use in a day, enter the caps and the strip under
                the chat will show how much is left of them. Some APIs report the requests left
                themselves, and that is used when it’s there. Leave these empty if you don’t know —
                the strip will show what this browser has used instead.
              </p>
              <div className="grid grid-cols-2 gap-3 pt-1">
                <label className="space-y-1">
                  <span className="text-muted-foreground block text-xs">Requests per day</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    value={requests}
                    onChange={(event) => setRequests(event.target.value)}
                    className={INPUT}
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-muted-foreground block text-xs">Tokens per day</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    value={tokens}
                    onChange={(event) => setTokens(event.target.value)}
                    className={INPUT}
                  />
                </label>
              </div>
              {submitted && allowanceError && (
                <p role="alert" className="text-destructive text-xs">
                  {allowanceError}
                </p>
              )}
            </fieldset>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t px-5 py-3">
            <button
              type="submit"
              className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-md px-3 py-1.5 text-sm"
            >
              Save
            </button>
            <button
              type="button"
              onClick={onClose}
              className="hover:bg-muted rounded-md border px-3 py-1.5 text-sm"
            >
              Cancel
            </button>
            <div className="flex-1" />
            {hasSavedKey && (
              <button
                type="button"
                onClick={() => {
                  onRemoveKey();
                  onClose();
                }}
                className="text-destructive hover:bg-muted rounded-md px-2 py-1.5 text-xs"
              >
                Remove saved key
              </button>
            )}
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}

/** One labelled field, with the hint that says where its value comes from. */
function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint: ReactNode;
  error?: string | null;
  children: (id: string, describedBy: string) => ReactNode;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block font-medium">
        {label}
      </label>
      {children(id, error ? `${hintId} ${errorId}` : hintId)}
      {error && (
        <p id={errorId} role="alert" className="text-destructive text-xs">
          {error}
        </p>
      )}
      <p id={hintId} className="text-muted-foreground text-xs">
        {hint}
      </p>
    </div>
  );
}

/**
 * The walk-through for one free option. It fills in the fields but never the
 * key — that is the person's own to make and paste.
 */
function FreeGuide({
  guide,
  startOpen,
  onFillIn,
}: {
  guide: SetupGuide;
  startOpen: boolean;
  onFillIn: () => void;
}) {
  return (
    <details open={startOpen} className="bg-muted/50 rounded-lg border px-3 py-2">
      <summary className="cursor-pointer font-medium">
        No coding agent yet? Set up a free one with {guide.name}
      </summary>
      <ol className="text-muted-foreground mt-2 list-decimal space-y-2 pl-5 text-xs">
        <li>
          Create a free account and an API key at{" "}
          <a
            href={guide.keysUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="text-foreground inline-flex items-center gap-0.5 underline underline-offset-2"
          >
            {guide.keysUrl.replace("https://", "")}
            <ExternalLink className="size-3" />
          </a>{" "}
          (“Create API Key”), then copy the key.
        </li>
        <li>
          Fill in the rest with the button below. It sets the API URL, the model name and the
          typical free-tier daily limits.
          <div className="pt-1.5">
            <button
              type="button"
              onClick={onFillIn}
              className="bg-background hover:bg-muted text-foreground rounded-md border px-2.5 py-1"
            >
              Fill in {guide.name}’s values
            </button>
          </div>
        </li>
        <li>
          Paste the key into <strong>API key</strong> below and press Save.
        </li>
      </ol>
      <p className="text-muted-foreground mt-2 text-xs">
        The free tier has daily limits. Your account’s real numbers are listed at{" "}
        <a
          href={guide.limitsUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="text-foreground underline underline-offset-2"
        >
          {guide.limitsUrl.replace("https://", "")}
        </a>
        ; if they differ, put them in Daily limits.
      </p>
    </details>
  );
}
