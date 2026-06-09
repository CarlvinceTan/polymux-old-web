import manifest from '../../demos/manifest.json'

export type SlideKey = (typeof manifest.slides)[number]['key']

export interface SlideRecording {
  route: string
  steps: Array<
    | { wait: number }
    | { click: string, position?: { x: number, y: number } }
    | { pointerdown: string }
    | { fill: string, text: string }
    | { press: string }
  >
}

export interface OnboardingSlide {
  key: SlideKey
  recording?: SlideRecording
}

export const ONBOARDING_SLIDES = manifest.slides as OnboardingSlide[]

export const SLIDE_KEYS = ONBOARDING_SLIDES.map(s => s.key)

/** When false, onboarding shows icon + gradient heroes; recording blocks still drive `pnpm demo:record`. */
export const ONBOARDING_USE_VIDEO_HERO = manifest.defaults.useVideoHero === true

export function slideHasRecording(slideKey: SlideKey): boolean {
  if (!ONBOARDING_USE_VIDEO_HERO) return false
  return ONBOARDING_SLIDES.some(s => s.key === slideKey && s.recording != null)
}

export function demoVideoSrc(slideKey: SlideKey): string {
  return `/demos/${slideKey}.mp4`
}

export function demoPosterSrc(slideKey: SlideKey): string {
  return `/demos/${slideKey}.poster.webp`
}

export const SLIDE_HERO: Record<SlideKey, string> = {
  welcome: 'bg-gradient-to-br from-amber-50 via-orange-50 to-rose-50',
  workflows: 'bg-gradient-to-br from-sky-50 via-indigo-50 to-violet-50',
  storage: 'bg-gradient-to-br from-orange-50 via-amber-50 to-yellow-50',
  integrations: 'bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50',
  vault: 'bg-gradient-to-br from-violet-50 via-purple-50 to-fuchsia-50',
  terms: 'bg-gradient-to-br from-neutral-50 via-white to-neutral-100',
}

export const RECORDABLE_SLIDE_KEYS = ONBOARDING_SLIDES
  .filter(s => s.recording != null)
  .map(s => s.key)
