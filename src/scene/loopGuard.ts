/**
 * Loop protection for the stage's render copy.
 *
 * A scene is re-rendered as the person types, so a half-written loop —
 * `while (i < 10) {` before the `i++` goes in — would hang the stage, and with
 * it the whole tab. Every loop in the scene's inline scripts gets a call to a
 * time-budget guard (defined by the bridge, see stageBridge.ts) at the top of
 * its body; the guard throws once the page has been looping for over a second
 * without yielding. Like the bridge, this lives only in the copy the iframe
 * renders, never in the stored source.
 *
 * The scripts are parsed rather than pattern-matched, so a `while` inside a
 * string or a comment is left alone and a loop without braces is still found.
 * A script that doesn't parse can't be guarded — and is probably mid-edit — so
 * the whole render is reported as failed and the stage keeps the last good one.
 */
import { parser } from "@lezer/javascript";
import type { SyntaxNode } from "@lezer/common";

/** The global the guard is installed under, inside the scene. */
export const LOOP_GUARD = "__boxcraftLoopGuard__";

const GUARD_CALL = `${LOOP_GUARD}();`;

/** A script's guarded source, or why it couldn't be guarded. */
export type GuardResult = { ok: true; code: string } | { ok: false };

const LOOPS = new Set(["WhileStatement", "ForStatement", "DoStatement"]);
const COMMENTS = new Set(["BlockComment", "LineComment"]);

function childrenOf(node: SyntaxNode): SyntaxNode[] {
  const out: SyntaxNode[] = [];
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (!COMMENTS.has(child.name)) out.push(child);
  }
  return out;
}

/** The statement a loop repeats: the last child, or the one after `do`. */
function loopBody(loop: SyntaxNode): SyntaxNode | undefined {
  const children = childrenOf(loop);
  return loop.name === "DoStatement" ? children[1] : children[children.length - 1];
}

/**
 * Put a guard call at the top of every loop body in a script. A braced body
 * gets it just inside the `{`; a bare statement is wrapped in braces with the
 * guard first, which leaves its meaning (and any labels) untouched.
 */
export function guardLoops(code: string): GuardResult {
  const tree = parser.parse(code);

  let broken = false;
  const inserts: { at: number; text: string; open: boolean }[] = [];
  tree.iterate({
    enter(ref) {
      if (ref.type.isError) {
        broken = true;
        return false;
      }
      if (!LOOPS.has(ref.name)) return;
      const body = loopBody(ref.node);
      if (!body) return;
      if (body.name === "Block") {
        inserts.push({ at: body.from + 1, text: GUARD_CALL, open: true });
      } else {
        inserts.push({ at: body.from, text: `{${GUARD_CALL}`, open: true });
        inserts.push({ at: body.to, text: "}", open: false });
      }
    },
  });
  if (broken) return { ok: false };

  // Splice from the end so earlier offsets stay valid. Where a close and an
  // open share an offset, the close belongs to the statement before — so it
  // is spliced last, which puts it first in the text.
  inserts.sort((a, b) => b.at - a.at || Number(b.open) - Number(a.open));
  let out = code;
  for (const { at, text } of inserts) out = out.slice(0, at) + text + out.slice(at);
  return { ok: true, code: out };
}

/** Script types the browser runs as JavaScript — the rest are data. */
function isJavaScript(attrs: string): boolean {
  const type = /\btype\s*=\s*(["']?)([^"'\s>]*)\1/i.exec(attrs)?.[2].toLowerCase();
  return (
    !type ||
    type === "module" ||
    type === "text/javascript" ||
    type === "application/javascript"
  );
}

/**
 * Guard the loops in every inline script of an HTML document. Scripts loaded
 * by `src` can't be rewritten and are left as they are; so are scripts that
 * aren't JavaScript (templates, JSON). `ok` is false when any script fails to
 * parse — the document is then not worth rendering.
 */
export function guardScripts(html: string): { ok: true; html: string } | { ok: false } {
  let ok = true;
  const out = html.replace(
    /(<script\b([^>]*)>)([\s\S]*?)(<\/script\s*>)/gi,
    (whole, open: string, attrs: string, code: string, close: string) => {
      if (/\bsrc\s*=/i.test(attrs) || !isJavaScript(attrs)) return whole;
      const guarded = guardLoops(code);
      if (!guarded.ok) {
        ok = false;
        return whole;
      }
      return open + guarded.code + close;
    },
  );
  return ok ? { ok, html: out } : { ok };
}
