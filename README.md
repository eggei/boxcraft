# BoxCraft

A quick-scaffolding tool for developers who make **CSS-only craft/art** — drop a
box, start styling it instantly, attach JS when you need behavior, without
writing boilerplate. Local-first, no accounts, no backend.

## Stack

- **React 19 + TypeScript + Vite 8** — plain static SPA (deploys to Vercel, no Next.js)
- **React Router 7** — every page has a URL, so links, reloads and Back all work
- **Tailwind CSS v4 + shadcn/ui** for the app chrome
- **Vitest + React Testing Library + jsdom** for tests
- **IndexedDB** (hand-rolled promise wrapper, no Dexie) for scene persistence

## Scripts

```bash
npm install      # install dependencies
npm run dev      # start the dev server (http://localhost:5173)
npm run lint     # lint with oxlint
npm test         # run the test suite once
npm run build    # type-check + build the static bundle to dist/
npm run preview  # preview the production build
```

## Routes

| Path        | Page                                                       |
| ----------- | ---------------------------------------------------------- |
| `/feed`     | L2 — the scrolling feed of scenes                          |
| `/feed/:id` | the feed, scrolled to one scene (the URL tracks scrolling) |
| `/files`    | L1 — the files grid                                        |
| `/edit/:id` | L3 — one scene in the editor                               |
| `/archived` | the archive                                                |

`/` redirects to the feed, and so does any URL naming a scene that no longer
exists. Paths are built in one place — `src/scenes/navigation.ts`.

## Backup & restore

Scenes live in the browser's IndexedDB, so there is nothing to lose but also
nothing to fall back on. The header's ⬇/⬆ buttons export the whole library —
active and archived scenes, sources byte-identical — to a dated
`boxcraft-library-YYYY-MM-DD.json` file, and read one back in. On import you
choose whether to **add** the file's scenes to what you have or **replace** the
library with them; ids that would collide are re-issued, so an import never
overwrites a scene you already had.

## Vim mode

The editor's gear menu has a **Vim mode** switch: modal editing in the source,
with a `-- NORMAL --` / `-- INSERT --` line under it. It is off by default, takes
effect on the open editor without losing the undo history, and is remembered in
`localStorage` (`boxcraft:editor-settings`, alongside the other editor settings).

Two things work differently while it is on:

- **`Esc` belongs to Vim** while focus is in the source, so it no longer leaves
  the editor. Use `:q` (or `:wq`, `:x` — scenes autosave, so they are the same)
  or the Exit button. `Esc` from anywhere else on the page still exits.
- **Drawing or picking a box puts the editor in insert mode**, where the cursor
  lands ready to be typed at — otherwise the first property typed would run as
  normal-mode commands.

## AI editor

The ✨ button in the editor's corner stack opens a chat box under the code. Ask
for a change in plain English ("add a red circle in the middle", "make the boxes
pulse") and it is made in the source — as one undo step, so ⌘/Ctrl+Z takes the
whole thing back. Questions get an answer without touching the code.

### Connecting a coding agent

There is no backend and no built-in model: you point the editor at a **coding
agent** — any chat API that follows the OpenAI `chat/completions` format (most
providers offer one, and local model servers do too) — from the gear in the
panel. The setup asks for:

| Field | What it is |
| --- | --- |
| API URL | The provider's base URL (usually ends in `/v1`) or its full `/chat/completions` endpoint. `https` only, except `localhost`. |
| API key | From the provider's dashboard. Optional — leave it empty for an API that needs none, such as a local model. |
| Model | The model's name exactly as the provider lists it. There is no default. |
| Daily limits | Optional. If your plan caps requests or tokens per day, enter them to see what's left. |

An API that speaks a different format (not OpenAI-style) won't work, and one
that doesn't allow requests from web pages (CORS) is refused by the browser; both
are reported in the chat with what to check.

The setup form also walks through a free option, **Groq**: create a key at
<https://console.groq.com/keys>, press "Fill in Groq's values", paste the key,
Save. That walk-through is data in `src/ai/presets.ts`; nothing else in the
editor knows a provider's name.

- **Where the key lives.** In this browser's `localStorage`
  (`boxcraft:ai-settings`), never in a scene or a library export. The setup form
  never shows the saved key again, only its first and last characters. A saved
  key is only ever sent to the URL it was saved for: change the URL to another
  host and it is dropped, not carried along.
- **What is sent.** The current scene's source and the last few chat turns, with
  every message, to the API URL you entered. Nothing else.
- **Usage remaining.** The strip under the input shows requests and tokens.
  "Left" figures come from the API's own `x-ratelimit-*-requests` headers when it
  sends them and the browser may read them (exact), or from the daily limits you
  entered minus what this browser has counted (marked `~`). With neither, it
  shows what has been used in the last 24 hours — it does not guess a limit.
  Counts are kept per API URL.
- **What it refuses to apply.** A reply that is cut off, empty, or missing the
  `<html>`/`<style>`/`.canvas` structure the scene already had; and any edit if
  the code changed while the agent was writing (with an "Apply anyway" button).
- **Known limit.** Scene previews run a scene's own `<script>` in the same
  origin as the app, so a scene from a file you don't trust could read the saved
  key. Use a key you can revoke, and don't import libraries you don't trust.

## Layout

- `src/persistence/` — IndexedDB wrapper (`idb.ts`) and the scene store (`scenes.ts`)
- `src/scenes/` — the scene list and its operations (`sceneList.ts`), the
  `useScenes` hook (load + continuous autosave), routes (`navigation.ts`) and the
  feed, files and archive pages
- `src/scene/` — the editor: the CodeMirror source pane, the live stage, the
  scene document helpers (`document.ts`), formatting and Vim mode
- `src/library/` — the export/import file format (`libraryFile.ts`) and its header controls
- `src/ai/` — the AI editor: prompt/reply rules (`prompt.ts`), the API client
  (`agentClient.ts`), settings and URL rules (`aiSettings.ts`), usage accounting
  (`usage.ts`), the free-option walk-through (`presets.ts`), and the chat panel
  and setup dialog
- `src/settings/`, `src/theme/` — editor settings and the light/dark theme, kept in `localStorage`
- `src/components/ui/` — shadcn/ui components
