// Headless prompt module for the AI editor.
//
// Everything between "the user typed a request" and "the document changes":
// what we tell the model, how we read its answer, and whether that answer is
// safe to put in the document. Pure — no network, no editor, no React — so the
// rules that protect the user's only copy of their scene are easy to test.

import { CANVAS_SIZE } from "@/scenes/sceneList";

/**
 * Scenes above this size are refused before a request is spent on them. The
 * agent has to send the whole document back, so a scene costs its own size
 * twice — and a reply has a ceiling (see `maxReplyTokens`) a bigger scene
 * could not fit under, so it would come back cut off.
 */
export const MAX_SOURCE_CHARS = 16_000;

/** How many earlier chat turns ride along, so "make it bigger" has a referent. */
const HISTORY_TURNS = 8;

export const SYSTEM_PROMPT = `You are the code editor built into BoxCraft, a tool for making CSS-only craft and art. A scene is one HTML file: a <style> block, a <body> holding a single <div class="canvas"> artboard (${CANVAS_SIZE}x${CANVAS_SIZE}px), and sometimes one <script> at the end of <body>.

Conventions you must respect:
- Keep the .canvas element and its CSS rule. Never remove or rename it.
- Shapes ("boxes") are <div class="box-N"> direct children of the canvas, positioned absolutely inside it and styled by a matching .box-N rule in the <style> block. Keep existing class names unless the user asks you to rename them. When you add a box, use the next unused number (box-3 after box-2).
- A box that has behaviour carries an id equal to its class, and the <script> looks it up with document.getElementById('box-N'). Keep the id and the lookup together.
- Prefer plain CSS (gradients, border-radius, box-shadow, clip-path, transforms, @keyframes) over JavaScript. Use JavaScript only when the user asks for behaviour.
- Everything must be self-contained: no external files, fonts, images, frameworks or network requests.
- Change only what the request needs. Leave everything else exactly as it is, including the order of the existing code.

How to answer:
- Reply with one or two short sentences saying what you changed.
- Then give the COMPLETE updated document in a single \`\`\`html fenced block: always the whole file from <!doctype html> to </html>, never a fragment or a diff.
- If the user asks a question, or the request needs no code change, answer in plain text and do not include a code block.`;

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface ModelMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * The conversation to send. The document is always the *current* one, attached
 * to the newest request only: earlier turns carry just their words, because the
 * documents they produced are already superseded by the one that follows.
 */
export function buildMessages(
  history: ChatTurn[],
  source: string,
  request: string,
): ModelMessage[] {
  return [
    { role: "system", content: SYSTEM_PROMPT },
    ...history.slice(-HISTORY_TURNS),
    {
      role: "user",
      content: `Current document:\n\`\`\`html\n${source}\n\`\`\`\n\nRequest: ${request}`,
    },
  ];
}

/**
 * Output budget for a reply: the whole document again, plus a sentence or two.
 * Code runs at roughly three characters a token, so this errs on the roomy side
 * — a reply cut off mid-document is worse than a slightly larger reservation.
 */
export function maxReplyTokens(source: string): number {
  return Math.min(8192, Math.max(2048, Math.ceil(source.length / 3) + 800));
}

export type ParsedReply =
  /** Prose only — an answer, or a request that needed no change. */
  | { kind: "message"; text: string }
  /** Prose plus a replacement document. */
  | { kind: "edit"; text: string; source: string }
  /** The document was cut off, so it must not be applied. */
  | { kind: "truncated"; text: string };

interface Fences {
  blocks: string[];
  prose: string;
  /** A fence was opened and never closed. */
  unclosed: boolean;
}

/** Split a reply into fenced code blocks and the prose around them. */
function splitFences(text: string): Fences {
  const blocks: string[] = [];
  const prose: string[] = [];
  let current: string[] | null = null;

  for (const line of text.split("\n")) {
    if (/^\s*```/.test(line)) {
      if (current) {
        blocks.push(current.join("\n"));
        current = null;
      } else {
        current = [];
      }
    } else if (current) {
      current.push(line);
    } else {
      prose.push(line);
    }
  }

  const unclosed = current !== null;
  if (current) blocks.push(current.join("\n"));
  return { blocks, prose: prose.join("\n").trim(), unclosed };
}

/**
 * Read the model's answer. The largest fenced block is the document (the reply
 * may carry a small illustrative snippet too); a block that never closes, or a
 * reply the model stopped for length, is reported as truncated rather than
 * guessed at — applying half a document would destroy the scene.
 */
export function parseReply(content: string, finishReason: string | null): ParsedReply {
  // Some reasoning models narrate inside <think> tags; that is not the answer.
  const cleaned = content.replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/\r\n/g, "\n");
  const { blocks, prose, unclosed } = splitFences(cleaned);
  const filled = blocks.filter((block) => block.trim() !== "");

  if (filled.length === 0) {
    return { kind: "message", text: prose || cleaned.trim() };
  }
  if (unclosed || finishReason === "length") {
    return { kind: "truncated", text: prose };
  }

  const source = filled.reduce((best, block) => (block.length > best.length ? block : best));
  return { kind: "edit", text: prose, source };
}

/**
 * Put the reply's document into the same trailing-newline shape as the one it
 * replaces: a fenced block never ends with its final newline, and a stray
 * difference there would register as a change to a document that has none.
 */
export function matchTrailingNewline(before: string, after: string): string {
  const body = after.replace(/\n+$/, "");
  return before.endsWith("\n") ? body + "\n" : body;
}

/**
 * The structure the editor's tools lean on. If the document had one of these
 * and the reply drops it, the reply is a fragment or a rewrite that has lost
 * the plot, not an edit — and `createBox` throws without a canvas or a style
 * block to put a box in.
 */
const STRUCTURE: { label: string; test: RegExp }[] = [
  { label: "<html> element", test: /<html[\s>]/i },
  { label: "</html> closing tag", test: /<\/html\s*>/i },
  { label: "<body> element", test: /<body[\s>]/i },
  { label: "<style> block", test: /<style[\s>]/i },
  // Same shape document.ts looks for when it finds the canvas.
  { label: ".canvas element", test: /<div[^>]*class="[^"]*\bcanvas\b[^"]*"[^>]*>/ },
];

/**
 * Why `after` must not replace `before`, or null when it may. Only structure the
 * original really had is required of the reply, so a scene the person has
 * already taken apart by hand isn't locked out of the assistant.
 */
export function validateEdit(before: string, after: string): string | null {
  if (after.trim() === "") return "The reply was empty.";
  const missing = STRUCTURE.filter(({ test }) => test.test(before) && !test.test(after)).map(
    ({ label }) => label,
  );
  if (missing.length === 0) return null;
  return `The reply left out the ${missing.join(", ")}, so it isn't a complete document.`;
}

/**
 * Whether the document has moved on since `base` was sent. Whitespace is
 * ignored: auto-format re-indents whenever the editor loses focus, and that is
 * not the person changing their mind about the code.
 */
export function hasChangedSince(base: string, current: string): boolean {
  if (base === current) return false;
  return base.replace(/\s+/g, "") !== current.replace(/\s+/g, "");
}
