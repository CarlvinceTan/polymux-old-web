// The TabPanel-using workspace sections a custom layout can attach to.
// Adding a new section means: register a nav-tabs composable, mount its
// router routes, then add the section id here so layouts can target it.
//
// Kept narrow on purpose — every section in this list needs to render
// custom tabs (PageHeader integration). Don't add a section until that
// wiring exists.

export const KNOWN_TARGET_SECTIONS = [
  'integrations',
  'storage',
  'vault',
  'dashboard',
] as const

export type LayoutTargetSection = typeof KNOWN_TARGET_SECTIONS[number]

export function isLayoutTargetSection(v: unknown): v is LayoutTargetSection {
  return typeof v === 'string' && (KNOWN_TARGET_SECTIONS as readonly string[]).includes(v)
}
