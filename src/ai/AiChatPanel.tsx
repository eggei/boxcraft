import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { LoaderCircle, SendHorizontal, Settings, Square, X } from "lucide-react";
import { WithTooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { isConfigured, type AiSettings } from "./aiSettings";
import { AiSetupDialog } from "./AiSetupDialog";
import type { UsageReport } from "./usage";
import type { AiChat, ChatEntry } from "./useAiChat";

interface AiChatPanelProps {
  settings: AiSettings;
  onSaveSettings: (settings: AiSettings) => void;
  onRemoveKey: () => void;
  chat: AiChat;
  usage: UsageReport;
  onClose: () => void;
}

const SUGGESTIONS = [
  "Add a red circle in the middle",
  "Give every box a soft shadow",
  "Make the boxes pulse slowly",
];

const COUNT = new Intl.NumberFormat("en-US");
const COMPACT = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

function formatWait(ms: number): string {
  const seconds = Math.max(1, Math.ceil(ms / 1_000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

/**
 * The assistant's side panel: a conversation, an input, and an always-visible
 * read-out of what is left of the allowance. It owns only what is on screen
 * (whether the setup dialog is up, the half-typed message); the conversation
 * and the setup are the parent's, so closing the panel loses neither.
 */
export function AiChatPanel({
  settings,
  onSaveSettings,
  onRemoveKey,
  chat,
  usage,
  onClose,
}: AiChatPanelProps) {
  const [setupOpen, setSetupOpen] = useState(false);
  const configured = isConfigured(settings);

  return (
    <section
      role="region"
      aria-label="AI editor"
      className="bg-background flex h-full min-h-0 flex-col border-t"
      // The panel owns the keyboard while focus is in it, so the app's own
      // shortcuts (Esc leaves the editor) can't fire from inside a message.
      onKeyDown={(event) => event.stopPropagation()}
    >
      <header className="flex items-center gap-1 border-b px-3 py-1.5">
        <h2 className="text-sm font-medium">AI editor</h2>
        {configured && (
          <span className="text-muted-foreground truncate text-xs">· {settings.model}</span>
        )}
        <div className="flex-1" />
        <WithTooltip tip="Which coding agent to use: its API URL, key and model">
          <button
            type="button"
            aria-label="Coding agent setup"
            onClick={() => setSetupOpen(true)}
            className="text-muted-foreground hover:text-foreground hover:bg-muted rounded-md p-1.5"
          >
            <Settings className="size-4" />
          </button>
        </WithTooltip>
        <WithTooltip tip="Close the assistant — the conversation is kept">
          <button
            type="button"
            aria-label="Close AI editor"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground hover:bg-muted rounded-md p-1.5"
          >
            <X className="size-4" />
          </button>
        </WithTooltip>
      </header>

      {configured ? (
        <>
          <Conversation chat={chat} />
          <Composer chat={chat} />
          <UsageReadout usage={usage} />
        </>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col items-start gap-2 overflow-auto p-3 text-sm">
          <p className="font-medium">Connect a coding agent</p>
          <p className="text-muted-foreground text-xs">
            The AI editor needs a chat API to talk to: its URL, a key and a model name. Setup
            explains where to find each, and has a free option if you don’t have one yet.
          </p>
          <button
            type="button"
            autoFocus
            onClick={() => setSetupOpen(true)}
            className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-md px-3 py-1.5 text-sm"
          >
            Set up coding agent
          </button>
        </div>
      )}

      {setupOpen && (
        <AiSetupDialog
          settings={settings}
          configured={configured}
          onSave={(next) => {
            onSaveSettings(next);
            setSetupOpen(false);
          }}
          onRemoveKey={onRemoveKey}
          onClose={() => setSetupOpen(false)}
        />
      )}
    </section>
  );
}

function Conversation({ chat }: { chat: AiChat }) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(
    function followTheConversation() {
      const list = listRef.current;
      if (list) list.scrollTop = list.scrollHeight;
    },
    [chat.entries, chat.busy],
  );

  return (
    <div
      ref={listRef}
      role="log"
      aria-label="Conversation"
      aria-live="polite"
      className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto px-3 py-2"
    >
      {chat.entries.length === 0 && !chat.busy && (
        <p className="text-muted-foreground text-xs">
          Describe a change and it is made in the code — ⌘/Ctrl+Z undoes it in one step.
        </p>
      )}
      {chat.entries.map((entry) => (
        <Entry key={entry.id} entry={entry} onApply={() => chat.applyProposed(entry.id)} />
      ))}
      {chat.busy && (
        <div className="text-muted-foreground flex items-center gap-2 text-xs" role="status">
          <LoaderCircle className="size-3.5 animate-spin" />
          Editing…
        </div>
      )}
    </div>
  );
}

function Entry({ entry, onApply }: { entry: ChatEntry; onApply: () => void }) {
  if (entry.role === "notice") {
    return <p className="text-muted-foreground text-xs italic">{entry.text}</p>;
  }

  if (entry.role === "error") {
    return (
      <p
        role="alert"
        className="border-destructive/40 text-destructive rounded-lg border px-3 py-1.5 text-sm break-words"
      >
        {entry.text}
      </p>
    );
  }

  const mine = entry.role === "user";
  return (
    <div className={cn("flex max-w-[90%] flex-col gap-1", mine ? "self-end" : "self-start")}>
      <p
        className={cn(
          "rounded-lg px-3 py-1.5 text-sm break-words whitespace-pre-wrap",
          mine ? "bg-accent text-accent-foreground" : "bg-muted",
        )}
      >
        {entry.text}
      </p>
      {entry.outcome?.status === "applied" && (
        <span className="text-muted-foreground px-1 text-xs">
          Applied to the code · undo with ⌘/Ctrl+Z
        </span>
      )}
      {entry.outcome?.status === "unchanged" && (
        <span className="text-muted-foreground px-1 text-xs">No change to the code</span>
      )}
      {entry.outcome?.status === "stale" && (
        <span className="text-muted-foreground flex flex-wrap items-center gap-2 px-1 text-xs">
          Not applied — the code changed while this was being written.
          <button
            type="button"
            onClick={onApply}
            className="hover:bg-muted rounded-md border px-2 py-0.5"
          >
            Apply anyway
          </button>
        </span>
      )}
    </div>
  );
}

function Composer({ chat }: { chat: AiChat }) {
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  async function submit() {
    const text = draft;
    if (!text.trim() || chat.busy) return;
    setDraft("");
    const accepted = await chat.send(text);
    // A refusal (no key, scene too big) keeps what was typed, so it isn't lost.
    if (!accepted) setDraft((current) => current || text);
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void submit();
    } else if (event.key === "Escape") {
      // First Esc stops a request in flight; otherwise it just leaves the box.
      if (chat.busy) chat.cancel();
      else event.currentTarget.blur();
    }
  }

  return (
    <div className="border-t px-3 py-2">
      {chat.entries.length === 0 && !chat.busy && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {SUGGESTIONS.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => {
                setDraft(suggestion);
                inputRef.current?.focus();
              }}
              className="text-muted-foreground hover:bg-muted hover:text-foreground rounded-full border px-2 py-0.5 text-xs"
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}
      <div className="flex items-end gap-2">
        <textarea
          ref={inputRef}
          aria-label="Describe a change"
          rows={2}
          autoFocus
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Describe a change…  (Enter to send)"
          className="border-input focus-visible:ring-ring min-h-0 flex-1 resize-none rounded-md border bg-transparent px-2 py-1.5 text-sm outline-none focus-visible:ring-[3px]"
        />
        {chat.busy ? (
          <WithTooltip tip="Stop waiting for the reply (Esc)">
            <button
              type="button"
              aria-label="Stop"
              onClick={chat.cancel}
              className="hover:bg-muted text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-md border"
            >
              <Square className="size-3.5 fill-current" />
            </button>
          </WithTooltip>
        ) : (
          <button
            type="button"
            aria-label="Send"
            disabled={!draft.trim()}
            onClick={() => void submit()}
            className="bg-primary text-primary-foreground hover:bg-primary/90 flex size-9 shrink-0 items-center justify-center rounded-md disabled:opacity-50"
          >
            <SendHorizontal className="size-4" />
          </button>
        )}
      </div>
    </div>
  );
}

function UsageReadout({ usage }: { usage: UsageReport }) {
  const { requests, tokens, blockedForMs, fractionLeft } = usage;
  const percent = fractionLeft === null ? null : Math.round(fractionLeft * 100);

  return (
    <WithTooltip
      side="top"
      tip={
        <>
          “Left” is what the API reports after each reply, or what remains of the daily limits you
          entered in the setup, counted in this browser — so it is an estimate, and other apps using
          the same key aren’t in it. With neither, this shows what has been used in the last 24
          hours.
        </>
      }
    >
      <div role="status" aria-label="AI usage remaining" className="border-t px-3 py-1.5 text-xs">
        {percent !== null && (
          <div
            role="progressbar"
            aria-label="Allowance left"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            className="bg-muted mb-1 h-1 overflow-hidden rounded-full"
          >
            <div
              className={cn(
                "h-full rounded-full transition-[width]",
                percent <= 10 ? "bg-destructive" : "bg-primary",
              )}
              style={{ width: `${percent}%` }}
            />
          </div>
        )}
        {blockedForMs !== null ? (
          <p className="text-destructive">
            Usage limit reached — try again in {formatWait(blockedForMs)}.
          </p>
        ) : (
          <p className="text-muted-foreground flex flex-wrap justify-between gap-x-3">
            <span>{describeRequests(requests)}</span>
            <span>{describeTokens(tokens)}</span>
          </p>
        )}
      </div>
    </WithTooltip>
  );
}

function describeRequests(requests: UsageReport["requests"]): string {
  if (requests.remaining === null || requests.limit === null) {
    return `${COUNT.format(requests.used)} ${requests.used === 1 ? "request" : "requests"} in the last 24h`;
  }
  return `${requests.exact ? "" : "~"}${COUNT.format(requests.remaining)} of ${COUNT.format(requests.limit)} requests left`;
}

function describeTokens(tokens: UsageReport["tokens"]): string {
  if (tokens.remaining === null || tokens.limit === null) {
    return `${COMPACT.format(tokens.used)} tokens in the last 24h`;
  }
  return `~${COMPACT.format(tokens.remaining)} of ${COMPACT.format(tokens.limit)} tokens left (est.)`;
}
