# Building a connection

A _connection_ in Polymux is a reusable bridge between a workflow and a third-party provider. Plugins consume connections by name; building a connection makes a new provider available to every plugin in the marketplace.

Connections are a more advanced authoring path than plugins. Most plugin authors will only ever consume connections that already exist in the marketplace. Build a custom connection when:

- The provider you need isn't published in the [marketplace](/integrations/marketplace) yet.
- An existing connector exposes the wrong shape — for example, your plugin needs a fine-grained OAuth scope that no existing connector requests.
- You are working with a closed-source internal provider.

## Connection kinds, recap

| Kind | When to build one | Authoring surface |
| --- | --- | --- |
| Vault | The provider authenticates with a static key or token. | Manifest only — no code. |
| OAuth | The provider uses OAuth2 or OIDC. | Manifest plus a small handler. |
| Integration | Provider needs custom auth, multiple secrets, or non-OAuth flows. | Manifest plus a full handler. |

Vault connections are pure declaration. OAuth and Integration connections require a handler that runs on Polymux's server to exchange secrets, refresh tokens, and route tool calls.

## Vault connections (no code)

A vault-only connection is declared entirely in the plugin manifest. Add it to your plugin's `connections` array:

```json
{
  "kind": "vault",
  "key": "stripe_restricted_key",
  "label": "Stripe restricted key",
  "help": "Use a restricted key with `write:checkout-sessions`.",
  "required": true,
  "shape": {
    "kind": "single",
    "field": "value",
    "secret": true
  }
}
```

`shape` describes what the installer pastes. `single` is one field. Other shapes:

- `pair` — username + password.
- `tuple` — N labelled fields, useful for `{ access_key, secret_key, region }` style triples.

The vault stores the value verbatim. Your workflow calls a tool action that pulls the secret out of the vault and injects it into the relevant HTTP header or CLI flag — see [Vault basics](/documentation/vault#how-agents-access-the-vault).

You do not write any handler code for vault connections.

## OAuth connections

OAuth connections need a handler so Polymux knows how to:

- Build the authorisation URL.
- Exchange the callback code for tokens.
- Refresh tokens before they expire.
- Surface a friendly error if the grant breaks.

A handler is a TypeScript module that implements the `ConnectorHandler` interface and lives in `web/server/connectors/`. The minimum surface is:

```ts
import type { ConnectorHandler } from './types'

export const myProviderConnector: ConnectorHandler = {
  id: 'my-provider',
  label: 'My Provider',
  scopes: ['read:user', 'write:posts'],

  buildAuthorizeUrl({ state, redirectUri }) {
    const params = new URLSearchParams({
      client_id: useRuntimeConfig().myProviderClientId,
      redirect_uri: redirectUri,
      state,
      scope: 'read:user write:posts',
      response_type: 'code',
    })
    return `https://provider.example.com/oauth/authorize?${params.toString()}`
  },

  async exchangeCode({ code, redirectUri }) {
    const res = await $fetch<TokenResponse>('https://provider.example.com/oauth/token', {
      method: 'POST',
      body: { code, redirect_uri: redirectUri, grant_type: 'authorization_code' },
    })
    return {
      access_token: res.access_token,
      refresh_token: res.refresh_token,
      expires_at: Date.now() + res.expires_in * 1000,
    }
  },

  async refresh({ refresh_token }) {
    // ... same shape as exchangeCode
  },

  async dispatchTool({ tool, args, credentials }) {
    // Translate workflow tool calls into HTTP requests
  },
}
```

Register the handler in `web/server/connectors/registry.ts`. From that point on it shows up in the marketplace as a connection plugins can declare.

The `dispatchTool` method is where you wire the provider's API into Polymux's tool model. Each tool a workflow can invoke gets dispatched through here. See `web/server/connectors/google-drive.ts` for the in-tree reference implementation.

## Integration connections

Integration connections are the most flexible — and the most work to author. Use them when OAuth does not fit:

- Multiple unrelated secrets (Stripe API key + webhook secret + publishable key).
- Non-HTTP transports (gRPC, raw TCP, MQTT).
- Provider-specific bootstrap flows (creating a service account, granting an IAM role).

The interface is the same `ConnectorHandler` shape but you implement a custom setup UI as well. Setup UIs live in `web/app/components/integration/<provider>/` and follow the same conventions as the rest of the dashboard.

This is generally a Polymux-engineering-level project. If you have a provider that needs an integration connector, start a thread in the [forum](/forum) — we have helped community authors land them in-tree.

## Testing a connection locally

Run the web app locally (`npm run dev` from `web/`), open `localhost:3000/integrations/marketplace`, and your handler will appear with the others. The full OAuth flow uses your runtime config's `APP_URL` as the redirect base, so make sure it matches what is registered with the provider.

For OAuth handlers, you can simulate the token exchange with `npm run script -- test-connector my-provider --code <code>` from `web/`. The script feeds a fake redirect into your handler and prints the tokens. Useful for catching schema mismatches before you involve a real OAuth round-trip.

## Publishing a connection

Connections are published through the same Publish tab as plugins, but you choose **Connection** instead of **Plugin** in the listing form. Reviews are stricter — a broken connector breaks every plugin that depends on it — and we may ask for a code review of the handler before approving.

Approved connections show up in the marketplace under the **Connections** tab. Plugin authors can immediately declare them in their manifests.

## Next steps

- Pair this with [Plugin manifest reference](/documentation/plugin-manifest) for the schema your connection appears in.
- See the [API overview](/documentation/api-overview) if you are calling Polymux directly instead of authoring inside the platform.
- Ready to ship? Read [Publishing checklist](/documentation/publishing).
