# Connections overview

A _connection_ is how a workflow reaches the outside world: an OAuth-authorised account, a vault-stored API key, a first-party integration. Plugins declare the connections they need in their manifest; installers authorise those connections at install time.

This page is from the installer's point of view. If you are building a plugin, also read [Building a connection](/documentation/connections-build).

## What kinds of connections exist

Polymux supports three connection kinds:

### Vault connections

A vault connection is a typed secret you paste into Polymux. The installer dialog tells you which key the plugin needs, what shape it expects (API key, bearer token, basic auth pair), and links you to where to get one.

Vault connections never leave your workspace. The plugin author cannot read them; Polymux engineers cannot read them. The only thing that touches the raw value is the agent action that uses it.

### OAuth connections

OAuth connections delegate authorisation to a third party. Click the **Authorise** button in the install dialog, you are bounced to the provider's consent screen, and on return the token is stored in your workspace's vault under a provider-scoped key.

Tokens are refreshed automatically. If a refresh fails (you revoked the grant, the provider rotated, your account was disabled), the connection is marked _broken_ and any plugin that depends on it pauses until you re-authorise.

### Integration connections

Integrations cover everything that isn't a built-in OAuth provider. Most live in the marketplace as community-published connectors that wrap a third-party API; Polymux's manifest describes the secrets the connector needs and the tools it exposes, and you install it the same way you install a plugin.

Each integration has its own setup flow with provider-specific fields. Once configured, an integration appears as a tool the workflow can call. Multiple plugins can share the same integration without re-authorising.

## Supported providers

OAuth provider supported in-tree:

- Google Drive — powers the workspace storage backbone.

Every other provider lives in the marketplace as an installable **integration**. Browse [Marketplace → Integrations](/integrations/marketplace) to see what's currently published, or author your own ([Building a connection](/documentation/connections-build)).

If a plugin you want to install depends on an integration that is not yet in the marketplace, the install will surface the missing dependency by name so you can grab it (or publish it) before retrying.

## Installing a plugin with connections

When you click **Install** on a marketplace listing, Polymux opens an install dialog that walks you through each required connection in order:

1. **Read the description.** Each connection has a label, a help blurb, and a required/optional flag.
2. **Authorise.** OAuth connections show an _Authorise_ button. Vault connections show a paste field. Integration connections show the relevant provider form.
3. **Confirm.** A summary screen lists everything the plugin will have access to. Press _Install_ to commit.

The plugin appears in your workspace's plugins list. Its first run happens manually unless the plugin has its own schedule, in which case Polymux runs it on schedule.

## Reconnecting a broken connection

From the plugin's settings, click **Reconnect** next to any broken connection. The dialog walks you through the same authorise / paste / confirm flow.

For OAuth providers, the most common cause of a broken connection is the underlying account being deleted or the OAuth grant being revoked from the provider's side. Reconnect picks up the new grant cleanly.

## Removing a connection

Removing a connection while a plugin still references it puts the plugin into a degraded state. Optional connections are dropped silently; required connections cause the plugin to fail on its next run.

You can remove a connection from **Vault → Connections**. The provider's grant on their side is not automatically revoked — to do that, go to the provider's account settings and revoke from there.

## Next steps

- Author your own connector: [Building a connection](/documentation/connections-build).
- See the connection schema as it appears in the plugin manifest: [Plugin manifest reference](/documentation/plugin-manifest#connections).
- Hit a permissions error mid-install? See the [FAQ](/documentation/faq#permissions-errors).
