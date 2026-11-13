import { describe, expect, it } from "vitest";
import { DEFAULT_SOURCE } from "@/scenes/sceneList";
import { createBox } from "@/scene/document";
import {
  MAX_SOURCE_CHARS,
  SYSTEM_PROMPT,
  buildMessages,
  hasChangedSince,
  matchTrailingNewline,
  maxReplyTokens,
  parseReply,
  validateEdit,
} from "./prompt";

const WITH_BOX = createBox(DEFAULT_SOURCE, { kind: "point", x: 10, y: 10 }).source;

describe("buildMessages", () => {
  it("sends the system prompt first and the current document with the request last", () => {
    const messages = buildMessages([], WITH_BOX, "make it round");

    expect(messages[0]).toEqual({ role: "system", content: SYSTEM_PROMPT });
    const last = messages[messages.length - 1];
    expect(last.role).toBe("user");
    expect(last.content).toContain(WITH_BOX);
    expect(last.content).toContain("Request: make it round");
  });

  it("carries earlier turns as words only, oldest first", () => {
    const messages = buildMessages(
      [
        { role: "user", content: "add a box" },
        { role: "assistant", content: "Added box-1." },
      ],
      WITH_BOX,
      "now make it red",
    );

    expect(messages.map((m) => m.role)).toEqual(["system", "user", "assistant", "user"]);
    expect(messages[1].content).toBe("add a box");
    // Only the newest request drags the document along.
    expect(messages.filter((m) => m.content.includes("<!doctype html>"))).toHaveLength(2);
  });

  it("keeps only the most recent turns of a long conversation", () => {
    const history = Array.from({ length: 30 }, (_, i) => ({
      role: i % 2 === 0 ? ("user" as const) : ("assistant" as const),
      content: `turn ${i}`,
    }));

    const messages = buildMessages(history, WITH_BOX, "next");

    expect(messages.length).toBeLessThan(15);
    expect(messages.some((m) => m.content === "turn 29")).toBe(true);
    expect(messages.some((m) => m.content === "turn 0")).toBe(false);
  });
});

describe("parseReply", () => {
  it("reads prose plus a fenced document as an edit", () => {
    const reply = "Made it round.\n\n```html\n<!doctype html>\n<html></html>\n```";

    expect(parseReply(reply, "stop")).toEqual({
      kind: "edit",
      text: "Made it round.",
      source: "<!doctype html>\n<html></html>",
    });
  });

  it("treats a reply with no code block as an answer, not an edit", () => {
    expect(parseReply("A box is a div with a class.", "stop")).toEqual({
      kind: "message",
      text: "A box is a div with a class.",
    });
  });

  it("takes the largest block when the reply has a small snippet too", () => {
    const reply = [
      "Swapped the colour.",
      "```css",
      ".box-1 { background: red; }",
      "```",
      "Full file:",
      "```html",
      "<!doctype html>",
      "<html>",
      "</html>",
      "```",
    ].join("\n");

    const parsed = parseReply(reply, "stop");

    expect(parsed.kind).toBe("edit");
    if (parsed.kind === "edit") expect(parsed.source).toBe("<!doctype html>\n<html>\n</html>");
  });

  it("never offers a document the model stopped in the middle of", () => {
    const unclosed = "Here you go.\n```html\n<!doctype html>\n<html>\n<body>";

    expect(parseReply(unclosed, "stop").kind).toBe("truncated");
  });

  it("never offers a document when the token limit was what ended the reply", () => {
    // A closing fence can still be there by coincidence; `length` is decisive.
    const reply = "```html\n<!doctype html>\n<html></html>\n```";

    expect(parseReply(reply, "length").kind).toBe("truncated");
  });

  it("drops a reasoning model’s <think> narration before reading the reply", () => {
    const reply = "<think>draw ```html in here? no</think>\nDone.\n```html\n<html></html>\n```";

    const parsed = parseReply(reply, "stop");

    expect(parsed).toEqual({ kind: "edit", text: "Done.", source: "<html></html>" });
  });

  it("ignores an empty fence rather than wiping the document with it", () => {
    expect(parseReply("Nothing to do.\n```html\n```", "stop").kind).toBe("message");
  });

  it("normalises Windows line endings", () => {
    const parsed = parseReply("ok\r\n```html\r\n<html>\r\n</html>\r\n```", "stop");

    expect(parsed.kind === "edit" && parsed.source).toBe("<html>\n</html>");
  });
});

describe("matchTrailingNewline", () => {
  it("restores the final newline a fenced block drops", () => {
    expect(matchTrailingNewline(DEFAULT_SOURCE, "<html></html>")).toBe("<html></html>\n");
  });

  it("does not invent one the original never had", () => {
    expect(matchTrailingNewline("<html></html>", "<html></html>\n\n")).toBe("<html></html>");
  });
});

describe("validateEdit", () => {
  it("accepts a complete document", () => {
    expect(validateEdit(WITH_BOX, WITH_BOX.replace("#4f46e5", "red"))).toBeNull();
  });

  it("refuses a fragment that would replace the whole scene", () => {
    const fragment = ".box-1 { background: red; }";

    expect(validateEdit(WITH_BOX, fragment)).toMatch(/complete document/);
  });

  it("refuses an empty reply", () => {
    expect(validateEdit(WITH_BOX, "   \n")).toMatch(/empty/);
  });

  it("refuses a reply that drops the canvas, which the box tool cannot work without", () => {
    const noCanvas = WITH_BOX.replace(/<div class="canvas">[\s\S]*?<\/div>/, "");

    expect(validateEdit(WITH_BOX, noCanvas)).toMatch(/\.canvas element/);
  });

  it("only demands structure the original actually had", () => {
    // A scene already taken apart by hand must still be editable.
    const bare = "<div>hello</div>";

    expect(validateEdit(bare, "<div>hello, world</div>")).toBeNull();
  });
});

describe("hasChangedSince", () => {
  it("is false for the same document", () => {
    expect(hasChangedSince(WITH_BOX, WITH_BOX)).toBe(false);
  });

  it("is false when only the indentation moved (auto-format on blur)", () => {
    const flush = WITH_BOX.split("\n")
      .map((line) => line.trimStart())
      .join("\n");

    expect(hasChangedSince(WITH_BOX, flush)).toBe(false);
  });

  it("is true when the person changed the code", () => {
    expect(hasChangedSince(WITH_BOX, WITH_BOX.replace("#4f46e5", "#000"))).toBe(true);
  });
});

describe("maxReplyTokens", () => {
  it("leaves room for the whole document again, within sane bounds", () => {
    expect(maxReplyTokens("x".repeat(300))).toBe(2048);
    expect(maxReplyTokens("x".repeat(9_000))).toBeGreaterThanOrEqual(3_000);
    expect(maxReplyTokens("x".repeat(MAX_SOURCE_CHARS * 4))).toBe(8192);
  });
});
