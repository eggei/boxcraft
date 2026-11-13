/**
 * The stage bridge: how the editor talks to a scene it can no longer touch.
 *
 * The stage iframe is sandboxed without `allow-same-origin`, so the scene's
 * scripts run in an opaque origin and can't reach the app (its storage, its
 * DOM, its cookies). The flip side is that the app can't reach into the scene
 * either — no `contentDocument`. Everything the stage needs from the rendered
 * scene (where the canvas and boxes are, what was clicked, which key was
 * pressed) is posted out by a small script injected into the render-only copy,
 * and the stage asks for a fresh measurement by posting in.
 *
 * Like the `data-bc` handles, the bridge lives only in the copy the iframe
 * renders. It is never part of the stored or exported source, and `serialize`
 * strips it by construction.
 */
import { BRIDGE_ATTR, instrument } from "./document";

/** Tags every bridge message, so stray `postMessage` traffic is ignored. */
export const BRIDGE_CHANNEL = "boxcraft-stage";

/** A rectangle in the iframe's viewport coordinates. */
export interface BridgeRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** The rendered geometry the stage draws its overlays from. */
export interface StageLayout {
  /** The `.canvas` element, or null when the scene has none. */
  canvas: BridgeRect | null;
  /** Every instrumented box, by handle. */
  boxes: Record<string, BridgeRect>;
}

export interface BridgeKey {
  key: string;
  code: string;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  repeat: boolean;
}

/** What the scene posts out. */
export type BridgeMessage = { channel: typeof BRIDGE_CHANNEL } & (
  | { type: "ready" }
  | ({ type: "layout" } & StageLayout)
  | { type: "click"; handle: string | null }
  | ({ type: "keydown" } & BridgeKey)
);

/** What the stage posts in. */
export type StageRequest = { channel: typeof BRIDGE_CHANNEL; type: "measure" };

export function isBridgeMessage(data: unknown): data is BridgeMessage {
  return (
    typeof data === "object" &&
    data !== null &&
    (data as { channel?: unknown }).channel === BRIDGE_CHANNEL &&
    typeof (data as { type?: unknown }).type === "string"
  );
}

function isRect(value: unknown): value is BridgeRect {
  if (typeof value !== "object" || value === null) return false;
  const r = value as Record<string, unknown>;
  return ["left", "top", "width", "height"].every((k) => typeof r[k] === "number");
}

/**
 * The layout a `layout` message carries, checked field by field: the scene's
 * own scripts share the iframe with the bridge and can post anything, so a
 * malformed message is dropped rather than trusted.
 */
export function layoutOf(message: BridgeMessage): StageLayout | null {
  if (message.type !== "layout") return null;
  const { canvas, boxes } = message as Partial<StageLayout>;
  if (canvas !== null && !isRect(canvas)) return null;
  if (typeof boxes !== "object" || boxes === null) return null;
  const clean: Record<string, BridgeRect> = {};
  for (const [handle, rect] of Object.entries(boxes)) {
    if (isRect(rect)) clean[handle] = rect;
  }
  return { canvas, boxes: clean };
}

/**
 * The script that runs inside the scene. Written as a real function so it is
 * type-checked and unit-testable, then shipped as its own source text — so it
 * must stay self-contained: no imports, no closures over module scope, only
 * its parameters and the scene's globals.
 */
export function installBridge(win: Window, channel: string) {
  const doc = win.document;
  const host = win.parent;

  function post(message: Record<string, unknown>) {
    message.channel = channel;
    host.postMessage(message, "*");
  }

  function rectOf(el: Element) {
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  }

  function measure() {
    const canvas = doc.querySelector(".canvas");
    const boxes: Record<string, unknown> = {};
    doc.querySelectorAll("[data-bc]").forEach(function (el) {
      boxes[el.getAttribute("data-bc") as string] = rectOf(el);
    });
    post({ type: "layout", canvas: canvas ? rectOf(canvas) : null, boxes });
  }

  win.addEventListener("message", function (event) {
    // Only the editor may ask; the scene's own scripts posting to themselves
    // don't count.
    if (event.source !== host) return;
    const data = event.data;
    if (data && data.channel === channel && data.type === "measure") measure();
  });

  win.addEventListener("load", function () {
    post({ type: "ready" });
    measure();
  });
  win.addEventListener("resize", measure);

  // Bubble phase, so the scene's own click handlers still run first.
  doc.addEventListener("click", function (event) {
    const target = event.target as Element | null;
    const box = target && target.closest ? target.closest("[data-bc]") : null;
    post({ type: "click", handle: box ? box.getAttribute("data-bc") : null });
  });

  // Focus lands in the iframe once the stage is clicked, and from then on
  // its key presses never reach the app — so they are posted out to be
  // replayed there. Keys typed into the scene's own fields stay the scene's.
  doc.addEventListener("keydown", function (event) {
    const target = event.target as HTMLElement | null;
    if (
      target &&
      (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))
    ) {
      return;
    }
    post({
      type: "keydown",
      key: event.key,
      code: event.code,
      altKey: event.altKey,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      shiftKey: event.shiftKey,
      repeat: event.repeat,
    });
  });
}

/** The bridge as an inline `<script>`, marked so `serialize` can find it. */
export function bridgeScript(): string {
  const call = `(${installBridge.toString()})(window, ${JSON.stringify(BRIDGE_CHANNEL)});`;
  return `<script ${BRIDGE_ATTR}>${call}</script>`;
}

/**
 * Insert the bridge ahead of everything the scene runs: straight after the
 * opening `<head>` (or `<body>`, or `<html>`), else at the very start. First,
 * so its listeners are in place even if a scene script throws.
 */
export function withBridge(html: string): string {
  const script = bridgeScript();
  for (const tag of [/<head\b[^>]*>/i, /<body\b[^>]*>/i, /<html\b[^>]*>/i]) {
    const m = tag.exec(html);
    if (m) {
      const at = m.index + m[0].length;
      return html.slice(0, at) + script + html.slice(at);
    }
  }
  return script + html;
}

/** The document the stage iframe renders: instrumented, with the bridge. */
export function stageDocument(source: string): string {
  return withBridge(instrument(source));
}
