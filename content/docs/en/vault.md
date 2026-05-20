# Vault basics

The vault is where you store credentials, API keys, and other secrets that agents need in order to act on your behalf. Anything an agent reads from the vault is logged, scoped to the session, and never returned to the model verbatim — it is injected into the page or tool call directly.

## What goes in the vault

There are two kinds of vault entries:

- **Passwords** — username / password pairs scoped to a domain. The agent fills them into login forms when it lands on a matching URL.
- **Wallet entries** — API keys, bearer tokens, OAuth client secrets, and other arbitrary secrets. These are injected into tool calls (HTTP request headers, CLI args) rather than typed into a form.

The vault does not store files, certificates, or SSH keys. Use [workspace storage](/documentation/installation) for those.

## Adding an entry

From the side panel, open **Vault → Passwords** or **Vault → Wallet** and press **+ New**. Give the entry a name, the host (for passwords) or a key shape (for wallet entries), and the value. The value is encrypted at rest with the workspace key; nobody — including Polymux engineers — can read it back without your auth.

## How agents access the vault

Agents do not see secrets. When a workflow needs one, it issues a typed request like _"the password for github.com"_ to the vault and Polymux injects the value into the next action without ever placing it in the agent's context window. The model knows the secret exists and what it is for; it does not know the actual characters.

If you watch a session pause and resume around a login form, that pause is the vault filling in credentials.

## Scoping

By default, every workspace member with the **Member** role or higher can use any vault entry in workflows. To restrict an entry, edit it and set its scope:

- **Workspace** — anyone with the workspace role can use it. Default.
- **Workflow** — only workflows in the listed IDs can request it. Useful for high-impact keys.
- **Owner only** — only the entry's creator can use it, including in scheduled runs.

There is no audit log UI yet, but every vault read is captured server-side. If you need to pull the log for a specific entry, [contact support](/contact).

## Rotating a secret

Open the entry, click **Rotate**, and paste the new value. The previous value is wiped — there is no version history in the vault. Workflows that referenced the old value continue to work on their next run; in-flight sessions still hold the old value in memory until they end.

## What happens if I delete an entry

Deletion is immediate and unrecoverable. Any session that pauses on a vault read for the deleted entry will fail with `vault_missing` and require a new entry. Scheduled runs will fail the same way. You will see a notification in the dashboard for any failed runs.

## Next steps

- Need to use an OAuth provider like Google Drive? Read [Connections](/documentation/connections-overview).
- Building a workflow that uses vault entries? Read [Plugin overview](/documentation/plugin-overview) — packaged workflows declare which vault keys they need so installers know what to provide.
