import { useId, useState, type KeyboardEvent } from "react";
import type { RenameProblem } from "./document";

/** What the field says when a name is refused, keyed by the domain's reason. */
function problemMessage(problem: RenameProblem, name: string): string {
  switch (problem) {
    case "empty":
      return "Enter a class name";
    case "invalid":
      return "Use letters, digits, - and _, starting with a letter or _";
    case "taken":
      return `.${name} is already used in this scene`;
  }
}

/**
 * Inline rename for the selected box, in place of a blocking `window.prompt`.
 * Enter submits; a refused name keeps the field open with the reason beneath
 * it. Escape cancels — and is kept from reaching the app, where it would
 * otherwise also leave the editor.
 */
export function BoxRenameField({
  initialName,
  onSubmit,
  onCancel,
}: {
  initialName: string;
  /** Try the name; return why it was refused, or null once it is applied. */
  onSubmit: (name: string) => RenameProblem | null;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(initialName);
  const [problem, setProblem] = useState<RenameProblem | null>(null);
  const errorId = useId();

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      setProblem(onSubmit(draft));
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onCancel();
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <input
        // Focus lands here the moment Rename is pressed, ready to type over.
        autoFocus
        onFocus={(event) => event.currentTarget.select()}
        aria-label="New class name"
        aria-invalid={problem !== null}
        aria-describedby={problem ? errorId : undefined}
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value);
          setProblem(null);
        }}
        onKeyDown={onKeyDown}
        spellCheck={false}
        className="bg-background aria-invalid:border-destructive w-40 rounded-md border px-2 py-1 font-mono text-sm"
      />
      {problem && (
        <p id={errorId} role="alert" className="text-destructive text-xs">
          {problemMessage(problem, draft.trim())}
        </p>
      )}
    </div>
  );
}
