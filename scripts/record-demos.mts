#!/usr/bin/env node
/**
 * Record onboarding slide demo videos from web/demos/manifest.json.
 *
 * Each slide with a `recording` block produces public/demos/{slideKey}.mp4
 * for the onboarding modal hero.
 *
 * Prerequisites:
 *   1. Dev server running: pnpm dev
 *   2. ffmpeg + ffprobe on PATH
 *   3. Logged-in session: auto-login via DEMO_RECORD_* / TEST_* env, or `pnpm demo:save-session`
 *
 * Usage:
 *   pnpm demo:record workflows     Record one onboarding slide
 *   pnpm demo:record --all           Record every slide that has `recording`
 *   pnpm demo:save-session           Save browser login for app routes
 */

import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Recast } from 'playwright-recast'
import { chromium, type Page } from 'playwright'

const __dirname = dirname(fileURLToPath(import.meta.url))
const webRoot = resolve(__dirname, '..')

const USER_ACTIONS = new Set([
  'click',
  'fill',
  'type',
  'press',
  'selectOption',
  'check',
  'uncheck',
])

interface RecastDefaults {
  speedUp?: {
    duringIdle?: number
    duringUserAction?: number
    duringNetworkWait?: number
    minSegmentDuration?: number
  }
  autoZoom?: {
    clickLevel?: number
    inputLevel?: number
    idleLevel?: number
    centerBias?: number
    transitionMs?: number
  }
  cursorOverlay?: {
    approachMs?: number
  } | false
  clickEffect?: {
    sound?: boolean | string
    opacity?: number
    radius?: number
    duration?: number
  } | false
  interpolate?: {
    fps?: number
    mode?: 'dup' | 'blend' | 'mci'
    quality?: 'fast' | 'balanced' | 'quality'
    passes?: number
  } | false
  render?: {
    format?: 'mp4' | 'webm'
    fps?: number
    crf?: number
  }
}

interface SlideRecording {
  route: string
  steps: DemoStep[]
  recast?: RecastDefaults
}

interface OnboardingSlideManifest {
  key: string
  recording?: SlideRecording
}

interface Manifest {
  version: number
  defaults: {
    viewport: { width: number, height: number }
    baseUrl: string
    outputDir: string
    session?: { storageState: string }
    recast?: RecastDefaults
    demoRecast?: RecastDefaults
  }
  slides: OnboardingSlideManifest[]
}

type DemoStep =
  | { wait: number }
  | { waitFor: string, timeout?: number }
  | { click: string, position?: { x: number, y: number }, first?: boolean }
  | { pointerdown: string }
  | { fill: string, text: string }
  | { press: string }

function parseEnvFile(path: string): Record<string, string> {
  if (!existsSync(path)) return {}
  const out: Record<string, string> = {}
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    out[key] = value
  }
  return out
}

function loadDemoCredentials(): { email: string, password: string } | null {
  const fromProcess = {
    email: process.env.DEMO_RECORD_EMAIL ?? process.env.TEST_USERNAME ?? '',
    password: process.env.DEMO_RECORD_PASSWORD ?? process.env.TEST_PASSWORD ?? '',
  }
  if (fromProcess.email && fromProcess.password) {
    return fromProcess
  }

  const envFiles = [
    resolve(webRoot, '.env'),
    resolve(webRoot, '.env.local'),
    resolve(webRoot, 'CLAUDE.local.md'),
  ]
  for (const file of envFiles) {
    const parsed = parseEnvFile(file)
    const email = parsed.DEMO_RECORD_EMAIL ?? parsed.TEST_USERNAME ?? ''
    const password = parsed.DEMO_RECORD_PASSWORD ?? parsed.TEST_PASSWORD ?? ''
    if (email && password) {
      return { email, password }
    }
  }

  return null
}

async function isAuthenticated(page: Page, baseUrl: string): Promise<boolean> {
  await page.goto(new URL('/workflow/new', baseUrl).href, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(800)
  return !page.url().includes('/sign-in')
}

async function dismissBetaOnboarding(page: Page) {
  await page.waitForTimeout(1000)
  const overlay = page.locator('[role=presentation].fixed.inset-0')
  if (!(await overlay.isVisible({ timeout: 2000 }).catch(() => false))) {
    return
  }

  const skip = page.locator('[role=dialog] button').filter({ hasText: /skip/i }).first()
  if (await skip.isVisible({ timeout: 1000 }).catch(() => false)) {
    await skip.click()
    await page.locator('input[name=acknowledged]').waitFor({ state: 'visible', timeout: 5000 })
  }

  await page.locator('label:has(input[name=acknowledged])').click()
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('[role=dialog] button')]
      .find(b => /get started/i.test(b.textContent ?? ''))
    btn?.click()
  })
  await overlay.waitFor({ state: 'hidden', timeout: 15000 })

  try {
    const origin = new URL(page.url()).origin
    await page.request.post(`${origin}/api/account/agreements/accept`, {
      data: { agreement: 'beta', version: '2026-05-03', locale: 'en' },
    })
  }
  catch {
    // Modal is already dismissed; audit POST is best-effort for demo sessions.
  }
}

async function openFirstSavedWorkflow(page: Page) {
  const row = page.locator('li.wf-item').filter({
    has: page.locator('.truncate'),
    hasNot: page.getByText('New Workflow', { exact: true }),
  }).first()
  await row.waitFor({ state: 'visible', timeout: 30000 })
  await row.click()
  await page.waitForURL(/\/workflow\/[0-9a-f-]{36}\/agent/, { timeout: 30000 })
}

async function waitForAppReady(page: Page) {
  await dismissBetaOnboarding(page)
  const serverOverlay = page.locator('text=Server unavailable').first()
  if (await serverOverlay.isVisible({ timeout: 1000 }).catch(() => false)) {
    await serverOverlay.waitFor({ state: 'hidden', timeout: 30000 })
  }
  const trigger = page.locator('[data-testid=workspace-dropdown-trigger]')
  await trigger.waitFor({ state: 'visible', timeout: 30000 })
  for (let i = 0; i < 30; i++) {
    const canClick = await trigger.click({ trial: true, timeout: 500 }).then(() => true).catch(() => false)
    if (canClick) return
    await page.waitForTimeout(1000)
  }
  throw new Error('App UI is not interactable — check dev server, backend, and onboarding state.')
}

const DEMO_INIT_SCRIPT = `
(() => {
  const origFetch = window.fetch.bind(window)
  window.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input.url
    if (url.includes('/health')) {
      return new Response('ok', { status: 200 })
    }
    return origFetch(input, init)
  }
})()
`

async function signIn(page: Page, baseUrl: string, email: string, password: string) {
  await page.goto(new URL('/sign-in', baseUrl).href, { waitUntil: 'networkidle' })
  await page.locator('#signin-email').fill(email)
  await page.locator('#signin-password').fill(password)
  await page.locator('#signin-password').press('Enter')
  await page.waitForFunction(
    () => !window.location.pathname.includes('/sign-in'),
    undefined,
    { timeout: 30000 },
  )
}

async function loginAndSaveSession(
  baseUrl: string,
  sessionPath: string,
  viewport: { width: number, height: number },
) {
  const creds = loadDemoCredentials()
  if (!creds) {
    throw new Error(
      'No demo credentials found. Set DEMO_RECORD_EMAIL + DEMO_RECORD_PASSWORD (or TEST_USERNAME + TEST_PASSWORD) in the environment or web/CLAUDE.local.md.',
    )
  }

  mkdirSync(dirname(sessionPath), { recursive: true })

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport })
  await context.addInitScript(DEMO_INIT_SCRIPT)
  const page = await context.newPage()

  console.log('Signing in for demo recording…')
  await signIn(page, baseUrl, creds.email, creds.password)
  await page.goto(new URL('/workflow/new', baseUrl).href, { waitUntil: 'domcontentloaded' })
  await waitForAppReady(page)

  if (!(await isAuthenticated(page, baseUrl))) {
    await browser.close()
    throw new Error('Auto-login failed — still redirected to sign-in.')
  }

  await context.storageState({ path: sessionPath })
  console.log(`Saved authenticated session to ${sessionPath}`)
  await browser.close()
}

async function ensureAuthenticatedSession(
  baseUrl: string,
  sessionPath: string | null,
  viewport: { width: number, height: number },
) {
  if (!sessionPath) return

  if (existsSync(sessionPath)) {
    const browser = await chromium.launch({ headless: true })
    const context = await browser.newContext({
      viewport,
      storageState: sessionPath,
    })
    await context.addInitScript(DEMO_INIT_SCRIPT)
    const page = await context.newPage()
    const ok = await isAuthenticated(page, baseUrl)
    if (ok) {
      await page.goto(new URL('/workflow/new', baseUrl).href, { waitUntil: 'domcontentloaded' })
      await waitForAppReady(page)
      await context.storageState({ path: sessionPath })
      await browser.close()
      return
    }
    await browser.close()
    console.warn('Saved session expired — re-authenticating…')
  }

  await loginAndSaveSession(baseUrl, sessionPath, viewport)
}

function loadManifest(): Manifest {
  const path = resolve(webRoot, 'demos/manifest.json')
  return JSON.parse(readFileSync(path, 'utf8')) as Manifest
}

function recordableSlides(manifest: Manifest): OnboardingSlideManifest[] {
  return manifest.slides.filter((s): s is OnboardingSlideManifest & { recording: SlideRecording } => s.recording != null)
}

function slideByKey(manifest: Manifest, slideKey: string): (OnboardingSlideManifest & { recording: SlideRecording }) | undefined {
  const slide = manifest.slides.find(s => s.key === slideKey)
  if (!slide?.recording) return undefined
  return slide as OnboardingSlideManifest & { recording: SlideRecording }
}

function parseArgs(argv: string[]) {
  const all = argv.includes('--all')
  const saveSession = argv.includes('--save-session')
  const raw = argv.includes('--raw')
  const baseUrlIdx = argv.indexOf('--base-url')
  const baseUrl = baseUrlIdx >= 0 ? argv[baseUrlIdx + 1] : undefined
  const ids = argv.filter(a => !a.startsWith('--') && a !== baseUrl)
  return { all, saveSession, raw, baseUrl, ids }
}

function requireFfmpeg() {
  const ffmpeg = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0
  const ffprobe = spawnSync('ffprobe', ['-version'], { stdio: 'ignore' }).status === 0
  if (!ffmpeg || !ffprobe) {
    throw new Error('ffmpeg and ffprobe must be on PATH (required by playwright-recast).')
  }
}

async function runStep(page: Page, step: DemoStep) {
  if ('wait' in step) {
    await page.waitForTimeout(step.wait)
    return
  }
  if ('waitFor' in step) {
    await page.locator(step.waitFor).waitFor({
      state: 'visible',
      timeout: step.timeout ?? 15000,
    })
    return
  }
  if ('press' in step) {
    await page.keyboard.press(step.press)
    return
  }
  if ('fill' in step) {
    await page.locator(step.fill).fill(step.text)
    return
  }
  if ('pointerdown' in step) {
    await page.locator(step.pointerdown).dispatchEvent('pointerdown')
    return
  }
  if ('click' in step) {
    const locator = step.first
      ? page.locator(step.click).first()
      : page.locator(step.click)
    if (step.position) {
      const box = await locator.boundingBox()
      if (box) {
        await page.mouse.click(
          box.x + box.width * step.position.x,
          box.y + box.height * step.position.y,
        )
        return
      }
    }
    await locator.click()
  }
}

function mergeRecast(
  defaults: RecastDefaults | undefined,
  slide: RecastDefaults | undefined,
): RecastDefaults | undefined {
  if (!defaults && !slide) return undefined
  const base = defaults ?? {}
  const over = slide ?? {}
  return {
    speedUp: { ...base.speedUp, ...over.speedUp },
    autoZoom: { ...base.autoZoom, ...over.autoZoom },
    cursorOverlay: over.cursorOverlay !== undefined ? over.cursorOverlay : base.cursorOverlay,
    clickEffect: over.clickEffect !== undefined ? over.clickEffect : base.clickEffect,
    interpolate: over.interpolate !== undefined ? over.interpolate : base.interpolate,
    render: { ...base.render, ...over.render },
  }
}

async function processWithRecast(
  artifactDir: string,
  mp4Path: string,
  viewport: { width: number, height: number },
  recastDefaults: RecastDefaults | undefined,
) {
  const cfg = recastDefaults ?? {}
  let pipeline = Recast.from(artifactDir).parse()

  if (cfg.speedUp) {
    pipeline = pipeline.speedUp(cfg.speedUp)
  }

  pipeline = pipeline.subtitles((action) => {
    if (!USER_ACTIONS.has(action.method)) return undefined
    return ' '
  })

  if (cfg.autoZoom) {
    pipeline = pipeline.autoZoom(cfg.autoZoom)
  }

  if (cfg.cursorOverlay !== false) {
    pipeline = pipeline.cursorOverlay(cfg.cursorOverlay ?? {})
  }

  if (cfg.clickEffect !== false) {
    pipeline = pipeline.clickEffect(cfg.clickEffect ?? { sound: false })
  }

  if (cfg.interpolate !== false) {
    pipeline = pipeline.interpolate(cfg.interpolate ?? { fps: 30, mode: 'blend' })
  }

  const render = cfg.render ?? {}
  await pipeline.render({
    format: render.format ?? 'mp4',
    resolution: viewport,
    fps: render.fps ?? 30,
    crf: render.crf ?? 23,
    burnSubtitles: false,
  }).toFile(mp4Path)
}

function convertToMp4(input: string, output: string) {
  const result = spawnSync('ffmpeg', [
    '-y',
    '-i', input,
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    '-an',
    output,
  ], { stdio: 'inherit' })
  if (result.status !== 0) {
    throw new Error(`ffmpeg mp4 conversion failed for ${input}`)
  }
}

function cleanupRecastSidecars(outDir: string, slideKey: string) {
  for (const ext of ['.srt', '.vtt']) {
    const sidecar = resolve(outDir, `${slideKey}${ext}`)
    if (existsSync(sidecar)) rmSync(sidecar)
  }
  const report = resolve(outDir, 'recast-report.json')
  if (existsSync(report)) rmSync(report)
}

function extractPoster(input: string, output: string) {
  const result = spawnSync('ffmpeg', [
    '-y',
    '-i', input,
    '-ss', '00:00:00.500',
    '-vframes', '1',
    output,
  ], { stdio: 'ignore' })
  if (result.status !== 0) {
    console.warn(`Poster extraction failed for ${input}`)
  }
}

async function recordSlide(
  manifest: Manifest,
  slideKey: string,
  baseUrl: string,
  raw: boolean,
) {
  const slide = slideByKey(manifest, slideKey)
  if (!slide) {
    const available = recordableSlides(manifest).map(s => s.key)
    throw new Error(`Slide "${slideKey}" has no recording config. Recordable slides: ${available.join(', ')}`)
  }

  const { viewport, outputDir, session, recast, demoRecast } = manifest.defaults
  const outDir = resolve(webRoot, outputDir)
  const artifactDir = resolve(webRoot, 'demos/.tmp', slideKey)
  const mp4Path = resolve(outDir, `${slideKey}.mp4`)
  const posterPath = resolve(outDir, `${slideKey}.poster.webp`)

  mkdirSync(outDir, { recursive: true })
  rmSync(artifactDir, { recursive: true, force: true })
  mkdirSync(artifactDir, { recursive: true })

  const sessionPath = session?.storageState
    ? resolve(webRoot, session.storageState)
    : null

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    viewport,
    recordVideo: {
      dir: artifactDir,
      size: viewport,
    },
    ...(sessionPath && existsSync(sessionPath) ? { storageState: sessionPath } : {}),
  })
  await context.addInitScript(DEMO_INIT_SCRIPT)

  await context.tracing.start({
    screenshots: true,
    snapshots: true,
    sources: false,
  })

  const page = await context.newPage()
  const url = new URL(slide.recording.route, baseUrl).href
  console.log(`Recording onboarding slide "${slideKey}" → ${url}`)

  await page.goto(url, { waitUntil: 'domcontentloaded' })
  await page.evaluate(() => {
    window.scrollTo(0, 0)
    document.documentElement.scrollTop = 0
    document.body.scrollTop = 0
  })
  await waitForAppReady(page)
  await page.evaluate(() => {
    window.scrollTo(0, 0)
    document.documentElement.scrollTop = 0
    document.body.scrollTop = 0
  })

  if (slideKey === 'workflows') {
    await openFirstSavedWorkflow(page)
    await page.evaluate(() => {
      window.scrollTo(0, 0)
      document.documentElement.scrollTop = 0
      document.body.scrollTop = 0
    })
  }

  for (const step of slide.recording.steps) {
    await runStep(page, step)
  }

  const tracePath = resolve(artifactDir, 'trace.zip')
  await context.tracing.stop({ path: tracePath })

  const video = page.video()
  const webmPath = resolve(artifactDir, 'video.webm')
  await page.close()

  if (!video) {
    await context.close()
    await browser.close()
    throw new Error(`No video recorded for slide "${slideKey}"`)
  }

  await video.saveAs(webmPath)
  await context.close()
  await browser.close()
  console.log(`Saved trace + source video in ${artifactDir}`)

  if (raw) {
    convertToMp4(webmPath, mp4Path)
    extractPoster(mp4Path, posterPath)
    console.log(`Saved ${mp4Path} (raw ffmpeg, no recast)`)
    if (existsSync(posterPath)) console.log(`Saved ${posterPath}`)
    return
  }

  requireFfmpeg()
  console.log(`Processing with playwright-recast…`)
  const recastConfig = mergeRecast(mergeRecast(recast, demoRecast), slide.recording.recast)
  await processWithRecast(artifactDir, mp4Path, viewport, recastConfig)
  console.log(`Saved ${mp4Path}`)
  cleanupRecastSidecars(outDir, slideKey)

  extractPoster(mp4Path, posterPath)
  if (existsSync(posterPath)) console.log(`Saved ${posterPath}`)
}

async function saveSession(baseUrl: string) {
  const manifest = loadManifest()
  const sessionPath = manifest.defaults.session?.storageState
  if (!sessionPath) {
    throw new Error('manifest.defaults.session.storageState is not configured')
  }
  const resolved = resolve(webRoot, sessionPath)
  mkdirSync(dirname(resolved), { recursive: true })

  console.log(`Opening ${baseUrl} — sign in, then press Enter in this terminal.`)
  const browser = await chromium.launch({ headless: false })
  const context = await browser.newContext({
    viewport: manifest.defaults.viewport,
  })
  const page = await context.newPage()
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' })

  await new Promise<void>((resolve) => {
    process.stdin.resume()
    process.stdin.once('data', () => resolve())
  })

  await context.storageState({ path: resolved })
  console.log(`Saved session to ${resolved}`)
  await browser.close()
}

async function main() {
  const manifest = loadManifest()
  const { all, saveSession, raw, baseUrl: cliBaseUrl, ids } = parseArgs(process.argv.slice(2))
  const baseUrl = cliBaseUrl ?? manifest.defaults.baseUrl
  const recordable = recordableSlides(manifest)

  if (saveSession) {
    await saveSession(baseUrl)
    return
  }

  const slideKeys = all
    ? recordable.map(s => s.key)
    : ids.length > 0
      ? ids
      : []

  if (slideKeys.length === 0) {
    console.log(`Usage:
  pnpm demo:record <slide-key>   Record one onboarding slide (${recordable.map(s => s.key).join(', ')})
  pnpm demo:record --all         Record all slides that have \`recording\` in manifest.json
  pnpm demo:save-session         Save logged-in browser session (not a slide — setup only)

Options:
  --base-url <url>               Override manifest baseUrl (default: ${manifest.defaults.baseUrl})
  --raw                          Skip playwright-recast (plain ffmpeg convert)
`)
    process.exit(1)
  }

  mkdirSync(resolve(webRoot, 'demos/.tmp'), { recursive: true })

  const sessionPath = manifest.defaults.session?.storageState
    ? resolve(webRoot, manifest.defaults.session.storageState)
    : null
  await ensureAuthenticatedSession(baseUrl, sessionPath, manifest.defaults.viewport)
  console.log('Authenticated session ready — recording slides.')

  for (const slideKey of slideKeys) {
    await recordSlide(manifest, slideKey, baseUrl, raw)
  }

  console.log('Done.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
