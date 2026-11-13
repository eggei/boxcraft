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

## Layout

- `src/persistence/` — IndexedDB wrapper (`idb.ts`) and the scene store (`scenes.ts`)
- `src/scenes/` — the scene list and its operations (`sceneList.ts`), the
  `useScenes` hook (load + continuous autosave), routes (`navigation.ts`) and the
  feed, files and archive pages
- `src/scene/` — the editor: the CodeMirror source pane, the live stage, the
  scene document helpers (`document.ts`), formatting and Vim mode
- `src/library/` — the export/import file format (`libraryFile.ts`) and its header controls
- `src/settings/`, `src/theme/` — editor settings and the light/dark theme, kept in `localStorage`
- `src/components/ui/` — shadcn/ui components
