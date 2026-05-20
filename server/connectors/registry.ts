import { googleDriveConnector } from './google-drive'
import type { ConnectorHandler } from './types'

// Source of truth for which providers have a first-party OAuth handler.
// Google Drive is the only one — it powers the workspace storage backbone.
// Other code-based integrations live in the marketplace catalog as
// kind='integration' rows pointing at third-party manifests; see
// `web/server/api/marketplace/integrations/index.post.ts`.
const CONNECTORS: Record<string, ConnectorHandler> = {
  'google-drive': googleDriveConnector,
}

export function getConnector(id: string): ConnectorHandler | null {
  return CONNECTORS[id] ?? null
}

export function listConnectors(): ConnectorHandler[] {
  return Object.values(CONNECTORS)
}

export function isConnectorId(id: string): boolean {
  return Object.prototype.hasOwnProperty.call(CONNECTORS, id)
}
