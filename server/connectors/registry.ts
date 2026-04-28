import { googleDriveConnector } from './google-drive'
import { gmailConnector } from './gmail'
import { githubConnector } from './github'
import { slackConnector } from './slack'
import { notionConnector } from './notion'
import { linearConnector } from './linear'
import type { ConnectorHandler } from './types'

// Source of truth for which providers have a first-party OAuth handler.
// Adding a new in-tree connector means: implement `ConnectorHandler`, register
// it here, seed a row in the `integrations` catalog (Phase 1+).
const CONNECTORS: Record<string, ConnectorHandler> = {
  'google-drive': googleDriveConnector,
  'gmail': gmailConnector,
  'github': githubConnector,
  'slack': slackConnector,
  'notion': notionConnector,
  'linear': linearConnector,
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
