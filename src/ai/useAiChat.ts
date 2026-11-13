import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type { SceneEditorHandle } from "@/scene/SceneEditor";
import { chatEndpoint, isConfigured, type AiSettings } from "./aiSettings";
import { AiRequestError, createChatCompletion } from "./agentClient";
import {
  MAX_SOURCE_CHARS,
  buildMessages,
  hasChangedSince,
  matchTrailingNewline,
  maxReplyTokens,
  parseReply,
  validateEdit,
  type ChatTurn,
} from "./prompt";
import type { AiUsage } from "./useAiUsage";

/** What became of the document in answer to one reply. */
export type EditOutcome =
  | { status: "applied" }
  /** The reply matched what was already there. */
  | { status: "unchanged" }
  /** The document moved on while the model was working; nothing was touched. */
  | { status: "stale"; proposed: string };

export interface ChatEntry {
  id: number;
  /** `notice` is the app talking (cancelled, nothing to change); `error` is a failure. */
  role: "user" | "assistant" | "error" | "notice";
  text: string;
  outcome?: EditOutcome;
}

export interface AiChat {
  entries: ChatEntry[];
  busy: boolean;
  /** Resolves true once the request was accepted, so the caller can clear its input. */
  send: (prompt: string) => Promise<boolean>;
  cancel: () => void;
  /** Apply an edit that was held back because the document had changed. */
  applyProposed: (entryId: number) => void;
}

/**
 * The assistant's conversation with one editor. It reads the document from the
 * editor at the moment of sending and writes back through the editor's own
 * undoable edit, so the editor stays the single owner of the source: the chat
 * holds words, never a copy of the scene.
 */
export function useAiChat({
  editor,
  settings,
  usage,
}: {
  editor: RefObject<SceneEditorHandle | null>;
  settings: AiSettings;
  usage: Pick<AiUsage, "onCall" | "onRateLimited" | "onAbandoned">;
}): AiChat {
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [busy, setBusy] = useState(false);

  // Read at send time rather than captured, so a key pasted a moment ago is
  // used by the very next message without the callbacks being rebuilt.
  const settingsRef = useRef(settings);
  const usageRef = useRef(usage);
  const entriesRef = useRef(entries);
  const busyRef = useRef(false);
  const controllerRef = useRef<AbortController | null>(null);
  const nextId = useRef(1);
  settingsRef.current = settings;
  usageRef.current = usage;
  entriesRef.current = entries;

  useEffect(function abortOnUnmount() {
    return function abort() {
      controllerRef.current?.abort();
    };
  }, []);

  const add = useCallback(function add(entry: Omit<ChatEntry, "id">): number {
    const id = nextId.current++;
    setEntries((current) => [...current, { ...entry, id }]);
    return id;
  }, []);

  const send = useCallback(
    async function send(rawPrompt: string): Promise<boolean> {
      const prompt = rawPrompt.trim();
      const handle = editor.current;
      if (!prompt || busyRef.current || !handle) return false;

      const { apiUrl, apiKey, model } = settingsRef.current;
      const endpoint = chatEndpoint(apiUrl);
      if (!endpoint || !isConfigured(settingsRef.current)) {
        add({ role: "error", text: "Set up the coding agent first (the gear above)." });
        return false;
      }

      const base = handle.getSource();
      if (base.length > MAX_SOURCE_CHARS) {
        add({
          role: "error",
          text:
            `This scene is ${base.length.toLocaleString()} characters; the editor sends a ` +
            `coding agent at most ${MAX_SOURCE_CHARS.toLocaleString()}. Nothing was sent.`,
        });
        return false;
      }

      // Only words go back as history — never the error and notice lines, which
      // were the app talking, not the agent.
      const history: ChatTurn[] = entriesRef.current.flatMap((entry) =>
        entry.role === "user" || entry.role === "assistant"
          ? [{ role: entry.role, content: entry.text }]
          : [],
      );

      add({ role: "user", text: prompt });
      const controller = new AbortController();
      controllerRef.current = controller;
      busyRef.current = true;
      setBusy(true);

      try {
        const result = await createChatCompletion({
          endpoint,
          apiKey,
          model,
          messages: buildMessages(history, base, prompt),
          maxTokens: maxReplyTokens(base),
          signal: controller.signal,
        });
        usageRef.current.onCall(endpoint, {
          tokens: result.totalTokens,
          rateLimit: result.rateLimit,
        });

        const reply = parseReply(result.content, result.finishReason);

        if (reply.kind === "message") {
          add({ role: "assistant", text: reply.text || "Done." });
          return true;
        }
        if (reply.kind === "truncated") {
          add({
            role: "error",
            text:
              "The reply was cut off before the document ended, so nothing was changed. " +
              "Try a smaller request.",
          });
          return true;
        }

        const proposed = matchTrailingNewline(base, reply.source);
        const problem = validateEdit(base, proposed);
        if (problem) {
          add({ role: "error", text: `${problem} Nothing was changed.` });
          return true;
        }

        if (hasChangedSince(base, handle.getSource())) {
          add({
            role: "assistant",
            text: reply.text || "Here is the edit.",
            outcome: { status: "stale", proposed },
          });
          return true;
        }

        const changed = handle.applySource(proposed);
        add({
          role: "assistant",
          text: reply.text || (changed ? "Done." : "That is already how it is."),
          outcome: { status: changed ? "applied" : "unchanged" },
        });
        return true;
      } catch (error) {
        if (error instanceof AiRequestError) {
          if (error.kind === "cancelled") {
            usageRef.current.onAbandoned(endpoint);
            add({ role: "notice", text: "Cancelled." });
            return true;
          }
          if (error.kind === "rate-limit") {
            usageRef.current.onRateLimited(endpoint, error.rateLimit);
          }
          add({ role: "error", text: error.message });
          return true;
        }
        add({ role: "error", text: "Something went wrong talking to the coding agent." });
        return true;
      } finally {
        controllerRef.current = null;
        busyRef.current = false;
        setBusy(false);
      }
    },
    [editor, add],
  );

  const cancel = useCallback(function cancel() {
    controllerRef.current?.abort();
  }, []);

  const applyProposed = useCallback(
    function applyProposed(entryId: number) {
      const entry = entriesRef.current.find((candidate) => candidate.id === entryId);
      const handle = editor.current;
      if (!handle || entry?.outcome?.status !== "stale") return;
      const changed = handle.applySource(entry.outcome.proposed);
      setEntries((current) =>
        current.map((candidate) =>
          candidate.id === entryId
            ? { ...candidate, outcome: { status: changed ? "applied" : "unchanged" } }
            : candidate,
        ),
      );
    },
    [editor],
  );

  return { entries, busy, send, cancel, applyProposed };
}
