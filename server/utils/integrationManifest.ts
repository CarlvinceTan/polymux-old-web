// Integration manifest spec (v1) — types + lightweight runtime validator.
//
// Plugin authors publish a `polymux.json` at the root of their repo (or any
// HTTPS URL). On publish we fetch and validate against this shape. The
// validator is intentionally hand-rolled to avoid pulling a JSON Schema
// library; the spec is small enough that bespoke checks read clearer than
// schema definitions.

export type IntegrationManifestCategory =
  | 'tool'
  | 'event_handler'
  | 'ui_surface'

export interface IntegrationManifestIdentity {
  slug: string
  name: string
  version: string
  description?: string
  author?: { name?: string, email?: string, url?: string }
  homepage?: string
  icon?: string
  tags?: string[]
}

export interface IntegrationManifestPermissions {
  scopes: string[]
  rationale?: string
}

export interface IntegrationManifestRequiresConnector {
  provider: string
  min_scopes?: string[]
}

export interface IntegrationManifestRuntime {
  /** Reserved for future client-side execution; only 'https' supported in v1. */
  transport: 'https'
  base_url: string
  request_timeout_ms?: number
}

export interface IntegrationManifestTool {
  name: string
  title?: string
  description?: string
  /** JSON Schema-shaped object. We pass it through to the orchestrator unchanged. */
  input_schema?: Record<string, unknown>
  handler: { method: 'POST' | 'GET', path: string }
  side_effects?: 'none' | 'read_only' | 'external_write'
}

export interface IntegrationManifestEvent {
  name: string
  description?: string
  handler: { method: 'POST' | 'GET', path: string }
}

export interface IntegrationManifestUiSurface {
  id: string
  title: string
  kind: 'iframe'
  url: string
  mounts_at: string
}

export interface IntegrationManifestLifecycle {
  install?: { method: 'POST' | 'GET', path: string }
  uninstall?: { method: 'POST' | 'GET', path: string }
  upgrade?: { method: 'POST' | 'GET', path: string }
  ping?: { method: 'POST' | 'GET', path: string }
}

export interface IntegrationManifestSecurity {
  request_signature?: {
    algorithm: 'hmac-sha256'
    header?: string
    timestamp_header?: string
  }
  ip_allowlist?: string[]
}

export interface IntegrationManifest {
  manifest_version: '1'
  identity: IntegrationManifestIdentity
  category: IntegrationManifestCategory
  permissions?: IntegrationManifestPermissions
  requires_connectors?: IntegrationManifestRequiresConnector[]
  runtime: IntegrationManifestRuntime
  tools?: IntegrationManifestTool[]
  events?: IntegrationManifestEvent[]
  ui_surfaces?: IntegrationManifestUiSurface[]
  lifecycle?: IntegrationManifestLifecycle
  security?: IntegrationManifestSecurity
}

// ---- Validation ----------------------------------------------------------

export class ManifestValidationError extends Error {
  constructor(public path: string, message: string) {
    super(`Manifest invalid at \`${path}\`: ${message}`)
    this.name = 'ManifestValidationError'
  }
}

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]*\/)?[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i
const SEMVER_RE = /^\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?(?:\+[a-z0-9.-]+)?$/i

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function expectString(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new ManifestValidationError(path, 'must be a non-empty string')
  }
  return value
}

function optionalString(value: unknown, path: string): string | undefined {
  if (value === undefined) return undefined
  return expectString(value, path)
}

function expectStringArray(value: unknown, path: string): string[] {
  if (!Array.isArray(value)) {
    throw new ManifestValidationError(path, 'must be an array')
  }
  return value.map((item, i) => expectString(item, `${path}[${i}]`))
}

function optionalStringArray(value: unknown, path: string): string[] | undefined {
  if (value === undefined) return undefined
  return expectStringArray(value, path)
}

function expectMethodPath(value: unknown, path: string): { method: 'POST' | 'GET', path: string } {
  if (!isObject(value)) {
    throw new ManifestValidationError(path, 'must be an object')
  }
  const method = expectString(value.method, `${path}.method`).toUpperCase()
  if (method !== 'POST' && method !== 'GET') {
    throw new ManifestValidationError(`${path}.method`, 'must be GET or POST')
  }
  const p = expectString(value.path, `${path}.path`)
  if (!p.startsWith('/')) {
    throw new ManifestValidationError(`${path}.path`, "must start with '/'")
  }
  return { method, path: p }
}

/**
 * Parse and validate an arbitrary JSON value as an integration manifest.
 * Throws `ManifestValidationError` with the offending path on the first
 * structural problem; does not collect every error.
 */
export function validateManifest(input: unknown): IntegrationManifest {
  if (!isObject(input)) {
    throw new ManifestValidationError('$', 'manifest must be a JSON object')
  }

  if (input.manifest_version !== '1') {
    throw new ManifestValidationError('manifest_version', "must be the string '1'")
  }

  // identity
  if (!isObject(input.identity)) {
    throw new ManifestValidationError('identity', 'must be an object')
  }
  const identity: IntegrationManifestIdentity = {
    slug: expectString(input.identity.slug, 'identity.slug'),
    name: expectString(input.identity.name, 'identity.name'),
    version: expectString(input.identity.version, 'identity.version'),
    description: optionalString(input.identity.description, 'identity.description'),
    homepage: optionalString(input.identity.homepage, 'identity.homepage'),
    icon: optionalString(input.identity.icon, 'identity.icon'),
    tags: optionalStringArray(input.identity.tags, 'identity.tags'),
  }
  if (!SLUG_RE.test(identity.slug)) {
    throw new ManifestValidationError('identity.slug', 'must match `[author/]name` slug format')
  }
  if (!SEMVER_RE.test(identity.version)) {
    throw new ManifestValidationError('identity.version', 'must be valid semver (e.g. 1.0.0)')
  }
  if (isObject(input.identity.author)) {
    identity.author = {
      name: optionalString(input.identity.author.name, 'identity.author.name'),
      email: optionalString(input.identity.author.email, 'identity.author.email'),
      url: optionalString(input.identity.author.url, 'identity.author.url'),
    }
  }

  // category
  const category = expectString(input.category, 'category')
  if (!['tool', 'event_handler', 'ui_surface'].includes(category)) {
    throw new ManifestValidationError('category', 'must be tool|event_handler|ui_surface')
  }

  // permissions (optional)
  let permissions: IntegrationManifestPermissions | undefined
  if (input.permissions !== undefined) {
    if (!isObject(input.permissions)) {
      throw new ManifestValidationError('permissions', 'must be an object')
    }
    permissions = {
      scopes: expectStringArray(input.permissions.scopes, 'permissions.scopes'),
      rationale: optionalString(input.permissions.rationale, 'permissions.rationale'),
    }
  }

  // requires_connectors (optional)
  let requires_connectors: IntegrationManifestRequiresConnector[] | undefined
  if (input.requires_connectors !== undefined) {
    if (!Array.isArray(input.requires_connectors)) {
      throw new ManifestValidationError('requires_connectors', 'must be an array')
    }
    requires_connectors = input.requires_connectors.map((rc, i) => {
      if (!isObject(rc)) {
        throw new ManifestValidationError(`requires_connectors[${i}]`, 'must be an object')
      }
      return {
        provider: expectString(rc.provider, `requires_connectors[${i}].provider`),
        min_scopes: optionalStringArray(rc.min_scopes, `requires_connectors[${i}].min_scopes`),
      }
    })
  }

  // runtime (required)
  if (!isObject(input.runtime)) {
    throw new ManifestValidationError('runtime', 'must be an object')
  }
  const transport = expectString(input.runtime.transport, 'runtime.transport')
  if (transport !== 'https') {
    throw new ManifestValidationError('runtime.transport', "v1 supports only 'https'")
  }
  const baseUrl = expectString(input.runtime.base_url, 'runtime.base_url')
  if (!baseUrl.startsWith('https://')) {
    throw new ManifestValidationError('runtime.base_url', 'must use https:// scheme')
  }
  let timeout: number | undefined
  if (input.runtime.request_timeout_ms !== undefined) {
    if (typeof input.runtime.request_timeout_ms !== 'number' || input.runtime.request_timeout_ms <= 0) {
      throw new ManifestValidationError('runtime.request_timeout_ms', 'must be a positive number')
    }
    timeout = input.runtime.request_timeout_ms
  }
  const runtime: IntegrationManifestRuntime = { transport: 'https', base_url: baseUrl, request_timeout_ms: timeout }

  // tools (optional)
  let tools: IntegrationManifestTool[] | undefined
  if (input.tools !== undefined) {
    if (!Array.isArray(input.tools)) {
      throw new ManifestValidationError('tools', 'must be an array')
    }
    tools = input.tools.map((t, i) => {
      if (!isObject(t)) {
        throw new ManifestValidationError(`tools[${i}]`, 'must be an object')
      }
      const tool: IntegrationManifestTool = {
        name: expectString(t.name, `tools[${i}].name`),
        title: optionalString(t.title, `tools[${i}].title`),
        description: optionalString(t.description, `tools[${i}].description`),
        handler: expectMethodPath(t.handler, `tools[${i}].handler`),
      }
      if (t.input_schema !== undefined) {
        if (!isObject(t.input_schema)) {
          throw new ManifestValidationError(`tools[${i}].input_schema`, 'must be a JSON Schema object')
        }
        tool.input_schema = t.input_schema as Record<string, unknown>
      }
      if (t.side_effects !== undefined) {
        const se = expectString(t.side_effects, `tools[${i}].side_effects`)
        if (!['none', 'read_only', 'external_write'].includes(se)) {
          throw new ManifestValidationError(`tools[${i}].side_effects`, 'must be none|read_only|external_write')
        }
        tool.side_effects = se as IntegrationManifestTool['side_effects']
      }
      return tool
    })
    // Tool names must be unique within the manifest.
    const seen = new Set<string>()
    for (const tool of tools) {
      if (seen.has(tool.name)) {
        throw new ManifestValidationError(`tools[*].name`, `duplicate tool name '${tool.name}'`)
      }
      seen.add(tool.name)
    }
  }

  // events (optional)
  let events: IntegrationManifestEvent[] | undefined
  if (input.events !== undefined) {
    if (!Array.isArray(input.events)) {
      throw new ManifestValidationError('events', 'must be an array')
    }
    events = input.events.map((e, i) => {
      if (!isObject(e)) {
        throw new ManifestValidationError(`events[${i}]`, 'must be an object')
      }
      return {
        name: expectString(e.name, `events[${i}].name`),
        description: optionalString(e.description, `events[${i}].description`),
        handler: expectMethodPath(e.handler, `events[${i}].handler`),
      }
    })
  }

  // ui_surfaces (optional)
  let ui_surfaces: IntegrationManifestUiSurface[] | undefined
  if (input.ui_surfaces !== undefined) {
    if (!Array.isArray(input.ui_surfaces)) {
      throw new ManifestValidationError('ui_surfaces', 'must be an array')
    }
    ui_surfaces = input.ui_surfaces.map((s, i) => {
      if (!isObject(s)) {
        throw new ManifestValidationError(`ui_surfaces[${i}]`, 'must be an object')
      }
      const kind = expectString(s.kind, `ui_surfaces[${i}].kind`)
      if (kind !== 'iframe') {
        throw new ManifestValidationError(`ui_surfaces[${i}].kind`, "v1 supports only 'iframe'")
      }
      const url = expectString(s.url, `ui_surfaces[${i}].url`)
      if (!url.startsWith('https://')) {
        throw new ManifestValidationError(`ui_surfaces[${i}].url`, 'must use https://')
      }
      return {
        id: expectString(s.id, `ui_surfaces[${i}].id`),
        title: expectString(s.title, `ui_surfaces[${i}].title`),
        kind: 'iframe',
        url,
        mounts_at: expectString(s.mounts_at, `ui_surfaces[${i}].mounts_at`),
      }
    })
  }

  // lifecycle (optional)
  let lifecycle: IntegrationManifestLifecycle | undefined
  if (input.lifecycle !== undefined) {
    if (!isObject(input.lifecycle)) {
      throw new ManifestValidationError('lifecycle', 'must be an object')
    }
    lifecycle = {}
    for (const hook of ['install', 'uninstall', 'upgrade', 'ping'] as const) {
      if (input.lifecycle[hook] !== undefined) {
        lifecycle[hook] = expectMethodPath(input.lifecycle[hook], `lifecycle.${hook}`)
      }
    }
  }

  // security (optional)
  let security: IntegrationManifestSecurity | undefined
  if (input.security !== undefined) {
    if (!isObject(input.security)) {
      throw new ManifestValidationError('security', 'must be an object')
    }
    security = {}
    if (input.security.request_signature !== undefined) {
      if (!isObject(input.security.request_signature)) {
        throw new ManifestValidationError('security.request_signature', 'must be an object')
      }
      const algo = expectString(input.security.request_signature.algorithm, 'security.request_signature.algorithm')
      if (algo !== 'hmac-sha256') {
        throw new ManifestValidationError('security.request_signature.algorithm', "v1 supports only 'hmac-sha256'")
      }
      security.request_signature = {
        algorithm: 'hmac-sha256',
        header: optionalString(input.security.request_signature.header, 'security.request_signature.header'),
        timestamp_header: optionalString(input.security.request_signature.timestamp_header, 'security.request_signature.timestamp_header'),
      }
    }
    if (input.security.ip_allowlist !== undefined) {
      security.ip_allowlist = expectStringArray(input.security.ip_allowlist, 'security.ip_allowlist')
    }
  }

  return {
    manifest_version: '1',
    identity,
    category: category as IntegrationManifestCategory,
    permissions,
    requires_connectors,
    runtime,
    tools,
    events,
    ui_surfaces,
    lifecycle,
    security,
  }
}
