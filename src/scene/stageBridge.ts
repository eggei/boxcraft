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
import { guardScripts, LOOP_GUARD } from "./loopGuard";

/** Tags every bridge message, so stray `postMessage` traffic is ignored. */
export const BRIDGE_CHANNEL = "boxcraft-stage";

/** How long the scene may loop without yielding before a loop is stopped (ms). */
export const LOOP_BUDGET = 1000;

/**
 * The bridge's script nonce. With scripts paused, a Content-Security-Policy
 * allows only scripts carrying it — the bridge keeps working, the scene's own
 * scripts and inline handlers don't run. Pausing is a convenience, not a
 * security boundary (the sandbox is that), so a fixed value is enough.
 */
const BRIDGE_NONCE = "boxcraft-bridge";

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
  /** The loop guard stopped a loop that ran past the budget. */
  | { type: "loop-stopped" }
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
export function installBridge(win: Window, channel: string, guardName: string, budget: number) {
  const doc = win.document;
  const host = win.parent;

  function post(message: Record<string, unknown>) {
    message.channel = channel;
    host.postMessage(message, "*");
  }

  // The loop guard (see loopGuard.ts): every guarded loop calls it once per
  // iteration. The clock starts at the first call in a task and is reset by a
  // timeout, which can only run once the task has yielded — so it measures
  // continuous looping, whichever loops it is spread across. Once over budget
  // it keeps throwing, so a loop whose own try/catch swallows the first error
  // is still stopped on its next iteration.
  let loopingSince = 0;
  let reported = false;
  (win as unknown as Record<string, unknown>)[guardName] = function guard() {
    const now = win.performance.now();
    if (!loopingSince) {
      loopingSince = now;
      win.setTimeout(function () {
        loopingSince = 0;
        reported = false;
      }, 0);
      return;
    }
    if (now - loopingSince < budget) return;
    const message =
      "BoxCraft stopped a loop that ran for over " +
      budget / 1000 +
      "s without yielding. Check the loop's exit condition.";
    if (!reported) {
      reported = true;
      console.error(message);
      post({ type: "loop-stopped" });
    }
    throw new Error(message);
  };

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
  const args = [BRIDGE_CHANNEL, LOOP_GUARD, LOOP_BUDGET].map((a) => JSON.stringify(a));
  const call = `(${installBridge.toString()})(window, ${args.join(", ")});`;
  return `<script ${BRIDGE_ATTR} nonce="${BRIDGE_NONCE}">${call}</script>`;
}

/** Lets only the bridge run: the scene's scripts and inline handlers are off. */
const PAUSE_POLICY = `<meta ${BRIDGE_ATTR} http-equiv="Content-Security-Policy" content="script-src 'nonce-${BRIDGE_NONCE}'">`;

/**
 * Insert the bridge ahead of everything the scene runs: straight after the
 * opening `<head>` (or `<body>`, or `<html>`), else at the very start. First,
 * so its listeners and the loop guard are in place before any scene script.
 * With `pauseScripts`, a policy that blocks every other script goes first.
 */
export function withBridge(html: string, { pauseScripts = false } = {}): string {
  const script = (pauseScripts ? PAUSE_POLICY : "") + bridgeScript();
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

/**
 * What the stage should render for `source`. Running, every inline script has
 * its loops guarded; if a script doesn't parse, there is nothing safe to render
 * (`ok: false`) and the stage keeps its last good render. Paused, the scripts
 * are left as written but blocked from running, so even a broken one renders.
 */
export function renderStage(
  source: string,
  { pauseScripts = false } = {},
): { ok: true; html: string } | { ok: false } {
  const instrumented = instrument(source);
  if (pauseScripts) return { ok: true, html: withBridge(instrumented, { pauseScripts }) };
  const guarded = guardScripts(instrumented);
  return guarded.ok ? { ok: true, html: withBridge(guarded.html) } : guarded;
}
