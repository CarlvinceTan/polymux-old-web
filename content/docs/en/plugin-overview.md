# Plugin overview

A Polymux plugin is a packaged workflow that someone else can install into their workspace in one click. Plugins bundle the workflow graph, the connections it needs (vault keys, OAuth providers, integrations), and a small manifest that describes the listing.

This page is the starting point for the developer guide. If you have not built a workflow yet, follow the [Quickstart](/documentation/quickstart) first.

## When to package a workflow as a plugin

Package a workflow when:

- You want **teammates in other workspaces** to use it without re-authoring.
- The workflow is **stable enough that you would not edit it** between every run.
- It uses **portable connections** — OAuth providers, public APIs, or vault keys that an installer can provide.

Do _not_ package a workflow when it embeds workspace-specific data (member emails hard-coded into prompts, internal hostnames, single-tenant secrets). Anyone who installs the plugin gets a copy of that data.

## Anatomy of a plugin

Every plugin is composed of four pieces:

1. **The workflow graph.** The nodes, edges, prompts, and tool selections you authored in the workflow editor. Versioned per the workflow's own version history.
2. **A manifest.** Name, description, icon, category, screenshots, and pricing. Surface metadata used by the marketplace and the install dialog.
3. **A connection schema.** The vault keys, OAuth providers, and integration IDs the workflow needs in order to run. Polymux uses this to prompt the installer for the right secrets at install time.
4. **A changelog.** Free-form release notes per published version. Surfaced on the listing page.

The next pages walk through each of these in turn.

## Two flavours of packaged work

Polymux supports two related artifacts in the marketplace:

- **Plugins** — packaged workflows. Imported into a workspace, run by the installer.
- **Connections** — packaged integrations. Imported once per workspace, then available to any workflow as a tool.

This guide focuses on plugins because that is what most authors start with. Connections are documented in [Building a connection](/documentation/connections-build).

## Distribution

Plugins can be published in three ways:

- **Public marketplace** — listed on [polymux.com/integrations/marketplace](/integrations/marketplace). Anyone with a Polymux account can install. Free or paid.
- **Workspace-only** — visible only to members of a single workspace. Useful for internal tooling that you do not want public.
- **Unlisted link** — accessible via direct URL but not indexed. Useful for closed beta or paid distribution outside Polymux.

You choose distribution when you submit; you can change it later without re-submitting for review.

## Pricing and revenue share

You can charge a one-time or monthly fee for a plugin. Polymux processes payments through Stripe and takes a 15% platform fee. The remainder pays out to your Stripe Connect account monthly.

Free plugins have no listing fee and no payment integration to set up. We recommend starting with a free release and adding pricing later once you have install numbers.

## Next steps

- Get hands-on: [Build your first plugin](/documentation/plugin-build).
- See the manifest format: [Plugin manifest reference](/documentation/plugin-manifest).
- Learn how installers authorise vault and OAuth access: [Connections](/documentation/connections-overview).
