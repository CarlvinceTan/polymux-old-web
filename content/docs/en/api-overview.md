# API overview

Polymux exposes a REST + WebSocket API for programmatic access to workspaces, workflows, and sessions. Everything you can do in the dashboard you can also do over the API — create sessions, run workflows, read messages, install plugins.

This page is the index. Authentication, individual endpoint shapes, and rate limits live on dedicated pages linked at the bottom.

## Base URL

```
https://api.polymux.co
```

The web app at `polymux.com` is a separate origin. It calls the same API under the hood; you can use whichever feels more natural.

## Authentication

Every authenticated endpoint accepts a bearer token in the `Authorization` header:

```
Authorization: Bearer <token>
```

Tokens are issued from **Settings → API → Tokens** in the dashboard. They are scoped to a workspace and have one of three roles:

| Scope | Capabilities |
| --- | --- |
| `read` | List + read endpoints only. |
| `write` | Read + create/update/delete on workspace resources. |
| `admin` | Write + member management + billing. |

Tokens never expire by themselves, but you can revoke them from the same page. Treat them like passwords — anyone with the token can act as the issuing user.

See [Authentication](/documentation/authentication) for the full token model, including session-scoped tokens and the OAuth client flow for installable apps.

## Resource shape

Every API resource is namespaced under a workspace. URLs look like:

```
/workspaces/{workspace_id}/workflows
/workspaces/{workspace_id}/workflows/{workflow_id}/runs
/sessions/{session_id}/messages
```

There are two top-level shortcuts:

- `/sessions/{id}` — sessions are workspace-scoped but you can address them globally because the ID embeds the workspace. Polymux looks the workspace up for you.
- `/me` — the caller's user record across workspaces.

## Routes by area

| Area | Page |
| --- | --- |
| Sessions | [Sessions](/documentation/api-sessions) |
| Workflows | [Workflows](/documentation/api-workflows) |
| Workspaces and members | [Workspaces](/documentation/api-workspaces) |
| Vault | [Vault](/documentation/api-vault) |
| Files and uploads | [Files](/documentation/api-files) |
| Plugins and marketplace | [Marketplace](/documentation/api-marketplace) |

Each page lists every endpoint in its area with the method, path, scope required, and request/response schema.

## WebSockets

Live session output streams over a WebSocket at:

```
wss://api.polymux.co/session/{session_id}/
```

The first frame the server sends after the handshake is a `session_state` snapshot. Subsequent frames are typed events — `message`, `viewport`, `tool_call`, `tool_result`. The full wire format is documented in [WebSocket protocol](/documentation/api-websocket).

## Pagination

List endpoints page with cursors:

```http
GET /workspaces/{id}/workflows?limit=50&cursor=eyJpZCI6...
```

Responses include `next_cursor` (null when there are no more pages). Cursors are opaque — do not try to parse them. They embed the workspace, query, and last-seen row so paging stays consistent under concurrent writes.

## Rate limits

Defaults per token:

- 60 requests / minute on read endpoints.
- 30 requests / minute on write endpoints.
- 10 concurrent active sessions.

429 responses include `X-RateLimit-Reset` (epoch seconds) and `X-RateLimit-Remaining`. The dashboard's API page shows your current usage live.

If you need higher limits for an integration, mention it in your token's purpose field and we will raise them. There is no automatic increase.

## SDKs

Official client libraries:

- **TypeScript / JavaScript** — `@polymux/sdk` on npm.
- **Python** — `polymux` on PyPI.

Both wrap the REST + WebSocket API and handle pagination, retries, and the bearer-token refresh dance. They are thin enough that direct HTTP calls work fine if you would rather not pull in a dependency.

## Next steps

- New to the API? Get a token: [Authentication](/documentation/authentication).
- Listening for live updates: [WebSocket protocol](/documentation/api-websocket).
- Looking for a specific endpoint? Each area has its own page (see _Routes by area_ above).
