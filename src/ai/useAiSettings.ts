import { useCallback, useState } from "react";
import {
  AI_SETTINGS_KEY,
  parseAiSettings,
  serializeAiSettings,
  type AiSettings,
} from "./aiSettings";

// Storage can throw (private mode, blocked cookies). The setup is then simply
// not remembered between visits; the assistant still works for the session.
function readStored(): string | null {
  try {
    return localStorage.getItem(AI_SETTINGS_KEY);
  } catch {
    return null;
  }
}

function store(settings: AiSettings) {
  try {
    localStorage.setItem(AI_SETTINGS_KEY, serializeAiSettings(settings));
  } catch {
    // ignore
  }
}

/**
 * React/storage adapter over the pure AI-settings module. The setup — and the
 * key in it — is kept in this browser's localStorage and nowhere else: it is
 * not part of a scene, so it can't leak into a library export, and the only
 * place it is ever sent is the API URL the person typed.
 */
export function useAiSettings() {
  const [settings, setSettings] = useState<AiSettings>(function resolveInitial() {
    return parseAiSettings(readStored());
  });

  const save = useCallback(function save(next: AiSettings) {
    // Through the parser, so what is held is exactly what a reload would read.
    const clean = parseAiSettings(serializeAiSettings(next));
    store(clean);
    setSettings(clean);
  }, []);

  const removeKey = useCallback(function removeKey() {
    setSettings(function clear(current) {
      const next = { ...current, apiKey: "" };
      store(next);
      return next;
    });
  }, []);

  return { settings, save, removeKey };
}
