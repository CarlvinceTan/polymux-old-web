import { test, expect, type Page } from '@playwright/test'

// These tests share one workflow + its single WS session and dispatch real
// runs, so run them serially — parallel workers contend on the same session.
test.describe.configure({ mode: 'serial' })

/**
 * Authenticated workflow-run smoke checks (runs in the `authed` project).
 *
 * Asserts the left-toolbar Run button actually dispatches a run, and that the
 * version-history drawer lists saved versions. We assert DISPATCH (the POST to
 * /runs), not full LLM completion — execution is covered elsewhere.
 *
 * Uses a known saved workflow in the test workspace. If those ids change,
 * update the constants below (or the workspace is empty → the spec skips).
 */

const WF = 'c3484954-aaa8-4ea1-b96f-0dce638aed30' // "E2E Run Validation (linear)"
const WS = '3afab4a2-7716-4a6b-a4b2-3e845fa253c2'
const USER = '0a3eceac-cc7c-4317-a800-f0ff83126757'

const SUPA = 'https://eorphiekakgrpwxvbjmu.supabase.co'
const PUB = 'sb_publishable_cQUcjmtcv0KcsatyVOwUJQ__W3DUqnU'
const API = 'http://localhost:8081'

// The onboarding/beta modal has a mount-race that re-shows it even when
// accepted server-side; as a full-screen overlay it blocks canvas clicks.
// Pre-seed the accepted flag (all key variants, since the composable may read
// it before the user id resolves) so the modal never opens.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(([ws, user]) => {
    const v = '2026-05-03'
    for (const u of [user, 'undefined', 'null', '']) {
      try { localStorage.setItem(`polymux:betaAgreementAccepted:${v}:${u}`, 'true') } catch { /* ignore */ }
    }
    try { localStorage.setItem('polymux_current_workspace_id', ws) } catch { /* ignore */ }
  }, [WS, USER])
})

// Load the workspace + session list, then client-side-navigate into the
// workflow (a cold goto to /workflow/<id> races the list and bounces to
// /workflow/new). Switch to Flow and wait for the canvas toolbar.
async function openFlow(page: Page) {
  await page.goto('/workflow')
  // Sidebar rows are <div @click="openWorkflow(id)">, not <a>; pick by id.
  const row = page.getByTestId(`wf-row-${WF}`)
  await row.waitFor({ state: 'visible', timeout: 20_000 })
  await row.click()
  await expect(page).toHaveURL(new RegExp(WF))
  await page.getByRole('button', { name: 'Flow', exact: true }).click()
  await page.getByTestId('wf-run-button').waitFor({ state: 'visible', timeout: 15_000 })
  // Give the WS session a beat to register so the run dispatches (else 409).
  await page.waitForTimeout(2_500)
}

test('left-toolbar Run button dispatches a workflow run', async ({ page }) => {
  await openFlow(page)

  const runPost = page.waitForRequest(
    r => /\/workflows\/[^/]+\/runs$/.test(r.url()) && r.method() === 'POST',
    { timeout: 15_000 },
  )
  await page.getByTestId('wf-run-button').click()

  const req = await runPost
  // The button's onRun sends the session id (= workflow id); no resume node.
  expect(req.postDataJSON()).toMatchObject({ session_id: expect.any(String) })
  expect(req.postDataJSON().resume_from_node_id).toBeUndefined()

  const res = await req.response()
  expect(res?.status(), 'run should be accepted (202)').toBe(202)
})

test('run-from-node dispatches a run with resume_from_node_id', async ({ page }) => {
  await openFlow(page)

  // Selecting the second node reveals its per-node toolbar (which carries the
  // "Run from here" button), then dispatch the resume run from it.
  const node = page.locator('[data-node-id="node-e2e-b"]')
  await node.waitFor({ state: 'visible', timeout: 10_000 })
  await node.click()
  const rerunBtn = page.getByTestId('wf-rerun-node-e2e-b')
  await rerunBtn.waitFor({ state: 'visible', timeout: 10_000 })

  const runFromPost = page.waitForRequest(
    r => /\/workflows\/[^/]+\/runs$/.test(r.url()) && r.method() === 'POST',
    { timeout: 15_000 },
  )
  await rerunBtn.click()

  const req = await runFromPost
  // The hallmark of "run from a certain node": resume_from_node_id is sent.
  expect(req.postDataJSON()).toMatchObject({ resume_from_node_id: 'node-e2e-b' })
  const res = await req.response()
  expect(res?.status()).toBe(202)
})

// "Run what you see": a run carrying an inline `steps` graph executes
// version-less (no workflow_versions row), so an unsaved draft is runnable.
// Asserts the run dispatches (202) and the run row has no version behind it.
test('inline draft run dispatches version-less', async ({ page, request }) => {
  await openFlow(page) // opens the workflow → registers the WS session

  const tok = await request.post(`${SUPA}/auth/v1/token?grant_type=password`, {
    headers: { apikey: PUB, 'content-type': 'application/json' },
    data: { email: 'carlvince@live.com', password: 'testing' },
  })
  const jwt = (await tok.json()).access_token as string

  const res = await request.post(`${API}/workspaces/${WS}/workflows/${WF}/runs`, {
    headers: { authorization: `Bearer ${jwt}`, 'content-type': 'application/json' },
    data: {
      session_id: WF,
      steps: { nodes: [{ id: 'n1', title: 'Open example.com', actions: ['Navigate to https://example.com'] }], wires: [] },
    },
  })
  expect(res.status(), 'inline run should be accepted (202)').toBe(202)
  const run = await res.json()
  expect(run.workflow_version_id ?? '', 'inline run is version-less').toBe('')
})

test('version-history drawer lists saved versions', async ({ page }) => {
  await openFlow(page)

  await page.getByTestId('wf-history-button').click()
  // The drawer renders one <li data-testid="wf-version-row"> per saved version.
  await expect(page.getByTestId('wf-version-row').first()).toBeVisible({ timeout: 10_000 })
  const count = await page.getByTestId('wf-version-row').count()
  expect(count, 'workflow has at least one saved version').toBeGreaterThan(0)
})
