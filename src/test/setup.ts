import "@testing-library/jest-dom/vitest";
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// jsdom does no layout, and its Range has no geometry methods at all. CodeMirror
// measures text through Range#getClientRects — and re-measures from an animation
// frame whenever the editor is reconfigured (the Vim toggle does) — so without
// these the missing method surfaces as an uncaught exception long after the
// test that caused it. An empty result is what a browser gives for a range with
// no box, and CodeMirror already copes with that.
if (typeof Range !== "undefined") {
  Range.prototype.getClientRects ??= () =>
    Object.assign([], { item: () => null }) as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect ??= () => new DOMRect(0, 0, 0, 0);
}

// Reset the DOM, the in-memory IndexedDB and the stored theme between tests so
// each one starts clean.
afterEach(() => {
  cleanup();
  globalThis.indexedDB = new IDBFactory();
  localStorage.clear();
  document.documentElement.classList.remove("dark");
  document.documentElement.style.colorScheme = "";
});
