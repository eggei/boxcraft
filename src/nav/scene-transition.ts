import type { Transition } from 'framer-motion'

/**
 * The shared spring for every `layoutId="scene-${id}"` transition (L1 card ↔
 * L2 feed item ↔ L3 focus, DESIGN.md §2). One constant so all three levels
 * animate identically — tuned for a quick, controlled settle rather than
 * Framer Motion's bouncier default, since this is a navigation transition
 * (get there fast, don't wobble) rather than a playful UI flourish. Feel,
 * not logic — tuned by eye in the browser, not unit-tested (Phase 5 — polish).
 */
export const SCENE_TRANSITION: Transition = {
  type: 'spring',
  duration: 0.32,
  bounce: 0.12,
}
