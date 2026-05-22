# Publishing checklist

You have built a plugin, filled out the listing, and the Publish tab's _Review_ panel looks correct. Before you press **Submit for review**, run this checklist. Most rejections are caused by something on this page.

## The workflow

- [ ] **Runs from a cold start.** Trigger a fresh run with the chat empty. The workflow must reach a terminal state on the first turn without you intervening.
- [ ] **No hardcoded secrets.** Search the prompt for anything that looks like a key, token, password, or email. Move every match to the vault and reference it by key.
- [ ] **No workspace-specific data.** Internal hostnames, member emails, sheet IDs, Slack channels — everything an installer might want to change must be a workflow input.
- [ ] **All tools are first-party or marketplace-published.** A plugin that imports a tool from your own private workspace will install but never run for anyone else.
- [ ] **Stops cleanly under failure.** Trigger a known failure path (wrong vault entry, offline provider) and confirm the workflow surfaces a useful error rather than spinning forever.

## The listing

- [ ] **Name** is 1–40 characters, no version number.
- [ ] **Short description** is one sentence, under 120 characters, and says what the plugin _does_ — not what it _is built with_.
- [ ] **Long description** explains what the plugin needs as input, what it produces, and what data it touches. Reviewers read this carefully.
- [ ] **Icon** is square and renders cleanly at 64×64.
- [ ] **Screenshots** show the plugin in use, not the marketing site. Two to four is the sweet spot.
- [ ] **Category** is the closest match. _Other_ is reserved for plugins that genuinely do not fit.
- [ ] **Tags** are accurate. Do not pad with unrelated terms — search ranks tag-stuffing low.

## The connections

- [ ] **Every required connection has a `label` that a stranger can understand.** _"OpenAI API key"_ is good; _"oai_k"_ is not.
- [ ] **Every required connection has a `help` blurb** unless the label is fully self-explanatory (OAuth providers usually are).
- [ ] **Optional connections degrade gracefully.** Trigger a run with each optional connection missing and confirm the workflow either skips that step or returns a sensible error.
- [ ] **Scopes are minimal.** Request the narrowest OAuth scope that lets the workflow function. Reviewers will push back on broad grants.

## Pricing (paid plugins only)

- [ ] **Stripe Connect is set up.** `Settings → Payouts` should show a verified account.
- [ ] **Currency and amount are correct.** Listings cannot have a currency changed after publish without contacting support.
- [ ] **Refund policy** is mentioned in the long description. There is no platform-wide policy; you set it.

## After submitting

- Reviews clear within two business days. You will get an email with the outcome.
- If rejected, the email lists the specific fields that need changes. Fix and resubmit — no penalty for multiple submissions.
- If approved, the listing goes live immediately. The marketplace's _New_ tab features it for the first 7 days.

## Versioning after launch

Bump versions for every change you push to the workflow:

- **Patch** (`1.0.0 → 1.0.1`) — bug fix, no behaviour change, no new connections.
- **Minor** (`1.0.0 → 1.1.0`) — new optional behaviour, optional connections, additional inputs with defaults.
- **Major** (`1.0.0 → 2.0.0`) — required new connection, removed input, materially different behaviour.

Installers can pin to a version range. Major bumps prompt them to re-authorise before updating.

## Unpublishing

You can pull a plugin from the marketplace at any time from the Publish tab. Existing installers keep the plugin running until they uninstall it; new installers cannot find it.

If you need to **emergency-kill** a plugin — for example, you discover it leaks data — contact support. We can disable the plugin server-side for every installer at once.

## Next steps

- Plugin update flow: [Build your first plugin](/documentation/plugin-build#7-publishing-updates).
- Author a custom connector: [Building a connection](/documentation/connections-build).
- Programmatic publishing: [API overview](/documentation/api-overview).
