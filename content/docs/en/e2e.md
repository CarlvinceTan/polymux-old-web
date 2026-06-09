# Browser E2E (Playwright)

Two complementary approaches:

- **Manual / interactive** — [playwright-cli](https://github.com/microsoft/playwright-cli) from the **polymux workspace root** for ad-hoc UI checks and screenshots (this doc, below).
- **Programmatic suite** — `@playwright/test` specs run from `web/` (`npm run test:e2e`). See [Programmatic suite](#programmatic-suite-playwrighttest).

## Manual interactive checks (playwright-cli)

Interactive UI checks for the Nuxt web app use playwright-cli from the **polymux workspace root** (not from `web/` alone).

## Prerequisites

- Web app running (e.g. `cd web && npm run dev` on port 3000)
- Polymux API running for agent/workflow tests (see polymux `config.dev.yaml`)
- Test account credentials in `web/CLAUDE.local.md` (`TEST_USERNAME` / `TEST_PASSWORD`, gitignored)

## Working directory and screenshots

```bash
cd /home/polymux/code/polymux
playwright-cli open http://localhost:3000/workflow/new
playwright-cli snapshot
playwright-cli screenshot --filename=.playwright-cli/screenshots/web/workflow-new.png
playwright-cli close
```

Save screenshots under `.playwright-cli/screenshots/web/`. Command reference: `.agents/skills/playwright-cli/SKILL.md`.

## Authentication

Sign in via the UI, or seed a Supabase session locally (password grant + cookie/localStorage) using values from `web/.env` and `web/CLAUDE.local.md`. Do not commit sessions, bootstrap HTML, or passwords.

## Sunmi / credential workflows

Long agent runs (e.g. Sunmi partner portal credential cards) are exercised with playwright-cli against a running API. Expect LLM latency and third-party site variability; capture screenshots for review.

## Programmatic suite (@playwright/test)

A runnable spec suite lives in `web/e2e/`, configured by `web/playwright.config.ts`. Run from `web/`:

```bash
cd web
npm run test:e2e          # headless, all projects
npm run test:e2e:ui       # Playwright UI mode
npm run test:e2e:report   # open the last HTML report
# scoped runs:
npx playwright test --project=public          # signed-out smoke (no creds)
npx playwright test --project=setup --project=authed   # authed smoke
```

The config starts `npm run dev` automatically if nothing is on port 3000 (`reuseExistingServer`), or set `E2E_BASE_URL` to point elsewhere (e.g. `dev.polymux.co`).

**Projects:**

- `setup` (`e2e/auth.setup.ts`) — signs in once via the UI and saves the Supabase session to `e2e/.auth/user.json` (gitignored). Credentials resolve from `E2E_USERNAME`/`E2E_PASSWORD`, then `TEST_USERNAME`/`TEST_PASSWORD`, then `web/CLAUDE.local.md`. It waits for client hydration and retries — clicking the sign-in submit before Vue hydrates does a native GET submit and stays on `/sign-in`.
- `public` — `*.public.spec.ts`, signed-out, no setup dependency.
- `authed` — every other `*.spec.ts`, reuses the stored session (per-test UI login flakes because local sessions drop to `/sign-in` within ~10s).

Keep smoke targets to pages that work in local dev (public pages, dashboard/vault/workflow). B2/Cloud storage and the FileBrowser grid can't be exercised locally.

### Playwright Agents (planner / generator / healer)

`npx playwright init-agents --loop=claude` scaffolded three Claude Code subagents under `web/.claude/agents/` (planner, generator, healer) plus prompt templates in `web/.claude/prompts/` and an `.mcp.json` for the test MCP server. Drive them from chat:

- **planner** — explores the app and writes a Markdown test plan into `web/specs/`.
- **generator** — turns a plan into `@playwright/test` specs under `web/e2e/`, using `e2e/seed.spec.ts` as the template.
- **healer** — runs a failing test, inspects the live UI, and repairs selectors/waits until it passes.

Note: `web/.claude/` is gitignored, so the agent definitions are local-only (not shared via git). Re-run `init-agents` after upgrading Playwright to refresh them.

## Related

- Workspace Playwright rules: polymux root `CLAUDE.md` (Playwright screenshots section)
- Credential UI tests: `web/app/composables/vault/credentialSiteMatch.test.ts`
