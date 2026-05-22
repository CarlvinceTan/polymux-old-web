# Plugin manifest reference

The manifest is the JSON document Polymux generates from the Publish tab and stores alongside every published plugin version. You normally do not edit it by hand — the form in the Publish tab is the supported authoring path — but the schema is documented here so you know exactly what gets serialised.

A manifest looks like this:

```json
{
  "schema_version": 1,
  "id": "wf_3jK9aXq",
  "version": "1.4.0",
  "name": "Daily HN digest",
  "short_description": "Summarise the top Hacker News stories into a Google Doc.",
  "description_md": "## What it does\n\nEvery morning at 9am, this plugin scrapes...",
  "icon": "icon.png",
  "screenshots": ["screen-01.png", "screen-02.png"],
  "category": "research",
  "tags": ["news", "google-drive", "summary"],
  "connections": [
    {
      "kind": "oauth",
      "provider": "google-drive",
      "label": "Google Drive",
      "scope": ["drive.file"],
      "required": true
    },
    {
      "kind": "vault",
      "key": "openai_api_key",
      "label": "OpenAI API key",
      "help": "Used for the summarisation step. Get one at platform.openai.com.",
      "required": true
    }
  ],
  "inputs": [
    {
      "key": "folder",
      "label": "Destination folder",
      "type": "string",
      "default": "Polymux Digests"
    }
  ],
  "pricing": {
    "kind": "free"
  },
  "changelog_md": "### 1.4.0\n\n- Adds optional comment thread support."
}
```

The rest of this page walks through each field.

## Top-level fields

| Field | Type | Notes |
| --- | --- | --- |
| `schema_version` | integer | Always `1` today. Polymux bumps this when breaking changes ship. |
| `id` | string | Stable workflow ID. Polymux assigns it; do not change. |
| `version` | string | Semver. Major bumps are required for breaking changes (see [Build a plugin](/documentation/plugin-build#7-publishing-updates)). |
| `name` | string | 1–40 characters. |
| `short_description` | string | Under 120 characters. Card subtitle. |
| `description_md` | string | Markdown. Listing body. |
| `icon` | string | Path to an icon file inside the bundle. PNG or SVG. |
| `screenshots` | array of string | Optional. Each entry is a path inside the bundle. |
| `category` | string | One of the marketplace categories. |
| `tags` | array of string | Up to 5 free-form tags. |

## `connections`

Each connection describes a piece of external state the workflow needs. Polymux uses this list to render the install dialog.

### Vault connections

```json
{
  "kind": "vault",
  "key": "openai_api_key",
  "label": "OpenAI API key",
  "help": "Used for the summarisation step.",
  "required": true
}
```

- `key` must match a vault key referenced by the workflow.
- `label` is what the installer sees.
- `help` is optional but recommended.
- `required: false` lets the workflow run without the value, useful for optional features.

### OAuth connections

```json
{
  "kind": "oauth",
  "provider": "google-drive",
  "label": "Google Drive",
  "scope": ["drive.file"],
  "required": true
}
```

- `provider` must be one of the [supported OAuth providers](/documentation/connections-overview#supported-providers) — today, that's `google-drive`.
- `scope` is provider-specific. Polymux validates it against the provider's catalogue at install time and rejects unknown scopes.

### Integration connections

```json
{
  "kind": "integration",
  "integration_id": "stripe",
  "label": "Stripe account",
  "required": true
}
```

`integration_id` is the id of a marketplace integration the workflow depends on (Stripe, AWS, internal connectors, etc.). The id matches the integration's marketplace slug; if the installer doesn't already have it, Polymux prompts them to install it before the plugin can run. See [Building a connection](/documentation/connections-build) for how integrations are authored.

## `inputs`

Inputs are workflow parameters the installer can configure at install time and edit afterwards from the workflow settings. Each input is:

| Field | Type | Notes |
| --- | --- | --- |
| `key` | string | Snake_case identifier used in the workflow graph. |
| `label` | string | Displayed in the install dialog and the settings page. |
| `type` | string | `string`, `number`, `boolean`, `select`, or `secret`. |
| `default` | varies | Optional default value. |
| `options` | array | Required for `type: "select"`. Each option is `{ value, label }`. |
| `help` | string | Optional. Short description shown below the field. |

A `secret` input is stored in the vault under the hood — use it for runtime-supplied tokens that you do not want logged.

## `pricing`

Three shapes:

```json
{ "kind": "free" }
```

```json
{
  "kind": "one_time",
  "amount_cents": 4900,
  "currency": "USD"
}
```

```json
{
  "kind": "subscription",
  "amount_cents": 900,
  "currency": "USD",
  "interval": "month"
}
```

Currency is ISO 4217 — Polymux supports USD, EUR, GBP, and JPY today. Amounts are integer cents (or equivalent minor units).

## `changelog_md`

A markdown document with release notes per version. Polymux only renders the section for the version being viewed; you are responsible for the section headers, but a convention of `### <version>` is what the install dialog and listing page parse.

## Validation

The Publish tab validates the manifest on every save. If you import a workflow manifest via the API, the same validator runs. Common errors:

- `connections[i].key` does not match any vault read in the workflow graph.
- `inputs[i].type: "select"` is missing `options`.
- `pricing.amount_cents` is below the platform minimum ($1 / 100 cents).

## Next steps

- See how installers experience the manifest: [Connections overview](/documentation/connections-overview).
- Build a custom connection that other plugins can depend on: [Building a connection](/documentation/connections-build).
- Push the plugin live: [Publishing checklist](/documentation/publishing).
