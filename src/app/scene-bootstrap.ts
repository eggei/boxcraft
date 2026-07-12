import type { Scene, SceneStore } from '../persistence/scene-store'

/** Phase 0 works on a single scene; multi-scene lists arrive in Phase 4. */
export const DEFAULT_SCENE_ID = 'default'

/**
 * The starter document a fresh install opens to. Every new scene is born with a
 * centered 400×400 `.canvas` (`position: relative`) — the bounded stage boxes
 * live on (DESIGN.md §1) — plus its rule. The `<style>` and `.canvas` are the
 * structure the Box tool writes into: it appends box rules to the end of
 * `<style>` and box divs as the last child of `.canvas`. The `<script>` logs to
 * the console so the real-devtools-console pipeline (DESIGN.md §3) is visible
 * immediately — there is no in-app console emulation.
 */
export const SEED_SOURCE = `<!doctype html>
<html>
  <head>
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        font-family: system-ui, sans-serif;
      }
      .canvas {
        position: relative;
        width: 400px;
        height: 400px;
        background: #f4f4f5;
        outline: 1px solid #e4e4e7;
      }
    </style>
  </head>
  <body>
    <div class="canvas"></div>
    <script>
      console.log('BoxCraft scene loaded');
    </script>
  </body>
</html>
`

/**
 * Load the single Phase-0 scene, seeding and persisting a starter document the
 * first time. Never overwrites an existing scene, so edits survive reloads.
 */
export async function loadOrCreateDefaultScene(store: SceneStore): Promise<Scene> {
  const existing = await store.get(DEFAULT_SCENE_ID)
  if (existing) return existing

  const seed: Scene = {
    id: DEFAULT_SCENE_ID,
    title: 'Scene 1',
    source: SEED_SOURCE,
  }
  await store.put(seed)
  return seed
}
