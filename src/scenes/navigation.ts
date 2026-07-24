// The three navigation levels.
//
// L1 (files) is furthest out, L3 (edit) is closest in. Levels are moved between
// explicitly — header buttons, clicking a tile or a card, Esc — so this module
// is just the enumeration; the adapters own gestures and animation.

export const LEVELS = ['files', 'feed', 'edit'] as const

export type Level = (typeof LEVELS)[number]
