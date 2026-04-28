import { listConnectors } from '~~/server/connectors/registry'

// GET /api/connectors
//
// Lists the in-tree first-party OAuth connectors. Used by the marketplace UI
// (Phase 1+) to know which catalog rows correspond to OAuth flows so it can
// route the install button through `/api/integrations/[provider]/connect`
// instead of the third-party install endpoint.

export default defineEventHandler(() => {
  return listConnectors().map(c => ({
    id: c.id,
    scopes: c.scopes.default,
    rationale: c.scopes.rationale,
    requires_oauth: true,
  }))
})
