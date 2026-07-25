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
npm run dev      # start the dev server (http://localhost:5174)
npm test         # run the test suite once
npm run build    # type-check + build the static bundle to dist/
npm run preview  # preview the production build
```

## Routes

| Path            | Page                                                     |
| --------------- | -------------------------------------------------------- |
| `/feed`         | L2 — the scrolling feed of scenes                        |
| `/feed/:id`     | the feed, scrolled to one scene (the URL tracks scrolling)|
| `/files`        | L1 — the files grid                                      |
| `/edit/:id`     | L3 — one scene in the editor                             |
| `/archived`     | the archive                                              |

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

## Layout

- `src/persistence/` — IndexedDB wrapper (`idb.ts`) and the scene store (`scenes.ts`)
- `src/scene/` — the `useScene` hook (load + continuous autosave)
- `src/library/` — the export/import file format (`libraryFile.ts`) and its header controls
- `src/components/ui/` — shadcn/ui components

The build proceeds core-first through five phases; foundation (scaffold,
tooling, persistence) is complete.
