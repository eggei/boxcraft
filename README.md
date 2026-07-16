# BoxCraft

A quick-scaffolding tool for developers who make **CSS-only craft/art** — drop a
box, start styling it instantly, attach JS when you need behavior, without
writing boilerplate. Local-first, no accounts, no backend.

## Stack

- **React 19 + TypeScript + Vite 8** — plain static SPA (deploys to Vercel, no Next.js)
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

## Layout

- `src/persistence/` — IndexedDB wrapper (`idb.ts`) and the scene store (`scenes.ts`)
- `src/scene/` — the `useScene` hook (load + continuous autosave)
- `src/components/ui/` — shadcn/ui components

The build proceeds core-first through five phases; foundation (scaffold,
tooling, persistence) is complete.
