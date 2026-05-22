# Authentication

Every authenticated request to the Polymux API carries a bearer token in the `Authorization` header. This page covers the three kinds of token Polymux issues, how to mint them, and how to refresh them.

If you are looking for the URL shape and base host, start with the [API overview](/documentation/api-overview).

## Token kinds

| Kind | Lifetime | When to use |
| --- | --- | --- |
| Personal access token (PAT) | Indefinite, revocable | Scripts, CLI tools, anywhere you control the secret. |
| OAuth client token | 1 hour, refresh-token rotates | Installable apps that act on behalf of a Polymux user. |
| Session-scoped token | Lifetime of the session | Short-lived integrations that only need one session's worth of access. |

Polymux does _not_ issue API keys without a token shape — there is no key that does not expire and cannot be revoked.

## Personal access tokens

Open **Settings → API → Tokens** in the dashboard and press **+ New token**. You will see:

- **Name.** Free-form; used to identify the token in the revocation UI.
- **Scope.** One of `read`, `write`, `admin`. See [API overview](/documentation/api-overview#authentication).
- **Workspace.** The workspace the token authorises against. Choose `*` for an account-wide token; this is required for `/me` and a few other cross-workspace endpoints.

The token is shown **once**. Copy it immediately and store it somewhere safe — Polymux does not retain the plaintext.

Revoke a token by deleting its row from the same page. Revocation is immediate and unconditional; in-flight requests using the token fail with `401 token_revoked`.

## OAuth client flow

If you are building an app that other Polymux users install (a third-party dashboard, a Slack bot, an IDE extension), use the OAuth2 authorisation code flow instead of asking users for a PAT.

Register an OAuth client from **Settings → API → OAuth clients**:

- **Name** and **homepage URL** are shown on the consent screen.
- **Redirect URIs** are the URLs Polymux is allowed to return the user to. List every URL you will ever use — exact-match.
- **Scopes** are the scopes your app will request. Users see this on the consent screen.

The flow is standard OAuth2:

```
1. Redirect the user to:
   https://polymux.com/oauth/authorize
     ?client_id=...&redirect_uri=...&scope=...&state=...&response_type=code

2. The user approves; Polymux redirects to your redirect_uri with ?code=...

3. Exchange the code for tokens:
   POST https://api.polymux.co/oauth/token
   Content-Type: application/x-www-form-urlencoded

   grant_type=authorization_code&code=...&client_id=...&client_secret=...&redirect_uri=...

4. Response:
   {
     "access_token": "...",
     "refresh_token": "...",
     "expires_in": 3600,
     "scope": "read write"
   }
```

Refresh before the access token expires:

```
POST /oauth/token
grant_type=refresh_token&refresh_token=...&client_id=...&client_secret=...
```

Refresh tokens rotate on every use. Always replace the stored refresh token with the one in the response.

## Session-scoped tokens

A session-scoped token authorises actions on exactly one session. Polymux issues one when you create a session via:

```
POST /sessions
```

The response includes a `session_token` field. Use it on every WebSocket and HTTP call against that session's ID. It expires when the session ends; no refresh, no renewal.

Session-scoped tokens are the recommended path for letting an untrusted client (a web frontend, a customer-facing widget) attach to a Polymux session without holding a longer-lived token. Mint the session server-side, hand the session token to the client, and the client never sees your PAT.

## Token shape

All Polymux tokens are JWTs signed with our root signing key. The payload is opaque to clients — do not parse it — but inspecting it during debugging is fine. Standard claims:

- `iss` — `polymux.co`.
- `sub` — user ID or OAuth client ID.
- `aud` — workspace ID, or `*` for cross-workspace tokens.
- `scope` — space-separated scopes.
- `exp` — expiry for OAuth and session tokens; absent for PATs.

If you store tokens in a database, hash them before storing. The server uses the JWT signature to verify, not a database lookup, so a stolen token is valid as long as it has not been revoked.

## Errors

| Code | Meaning |
| --- | --- |
| `401 token_missing` | No `Authorization` header. |
| `401 token_invalid` | Malformed or unsigned JWT. |
| `401 token_revoked` | PAT revoked or OAuth grant revoked. |
| `401 token_expired` | Access token expired; refresh and retry. |
| `403 scope_insufficient` | Token is valid but lacks the required scope. |
| `403 workspace_mismatch` | Token is scoped to a different workspace. |

Every error response includes a `request_id` header you can quote to support.

## Next steps

- Browse the endpoint pages from the [API overview](/documentation/api-overview).
- For live updates, you also need the [WebSocket protocol](/documentation/api-websocket).
- Building an installable app? Pair this with [Plugin overview](/documentation/plugin-overview).
