# Port a Hermes / OpenClaw plugin

You don't have to rewrite a plugin to bring it to Polymux. Plugins from
**Hermes** and **OpenClaw** expose their tools over the **Model Context
Protocol (MCP)**, and Polymux is always an MCP _client_ — it never hosts your
plugin's compute. So porting is really one step: read the plugin's MCP tools
and emit a Polymux manifest.

```
Hermes / OpenClaw plugin
  └─ exposes tools over MCP ──▶ transpiler ──▶ polymux.json ──▶ marketplace
                                (tools/list → manifest)
```

A runnable example lives in the
[`polymux-examples`](https://github.com/PolymuxOrg/polymux-examples) repo under
[`plugin-port-example/`](https://github.com/PolymuxOrg/polymux-examples/tree/main/plugin-port-example).

## Where the plugin runs

Polymux never runs the MCP server for you. You choose where it lives by picking
a `runtime.transport` in the emitted manifest:

| `transport` | Runs on | Use when |
| --- | --- | --- |
| `mcp` | the **author's** server (you host it) | the plugin should work in scheduled/background runs; scales as a connection, not a process |
| `client` | the **user's** Polymux native app / browser extension | the tool needs local resources (files, the browser) or the user's own credentials; no hosting |

A native-only plugin ships `client`. To instead host that same plugin over
HTTP, you republish with `mcp` plus a `base_url` — that's the override.

> `client` tools only run while the user's app is connected, so they can't serve
> server-side scheduled runs. Prefer `mcp` for anything that must run unattended.

## Steps

1. **Run the plugin's MCP server** so its tools can be read. A hosted plugin
   has a public URL; a local/stdio plugin you start on your machine.
2. **Transpile** — point the transpiler at that endpoint:

   ```bash
   # Author-hosted (transport: mcp)
   npx @polymux/plugin-transpiler --mcp-url https://mcp.example.com/plugin \
     --slug my-plugin --name "My Plugin" --out polymux.json

   # Native-app / extension only (transport: client) — the URL is used only to
   # read tool schemas and is NOT written into the manifest
   npx @polymux/plugin-transpiler --mcp-url http://localhost:8080/plugin \
     --transport client --slug my-plugin --out polymux.client.json
   ```

3. **Publish** the resulting `polymux.json` exactly like any other connection —
   see [Building a connection](/documentation/connections-build). Polymux
   fetches and validates it against the
   [manifest reference](/documentation/plugin-manifest), then it enters review.

## What the transpiler maps

| MCP (`tools/list`) | Polymux manifest |
| --- | --- |
| server name / version | `identity.slug` / `name` / `version` |
| `tool.name` / `description` | `tools[].name` / `description` |
| `tool.title` / `annotations.title` | `tools[].title` |
| `tool.inputSchema` | `tools[].input_schema` (copied verbatim) |
| `annotations.readOnlyHint` | `side_effects: "read_only"` |
| `annotations.destructiveHint` | `side_effects: "external_write"` |

For `mcp`/`client` transports each tool is addressed by name, so no per-tool
`handler` is emitted (that's only for plain HTTPS-webhook connections).

## What does not port

Hermes/OpenClaw **skills, commands, prompts, and agents** aren't tools — they're
prompt/instruction assets. Bring those into Polymux as **workflows** instead.
MCP `resources` and `prompts` have no place in a tool manifest and are dropped
(the transpiler warns when it skips them).
