import { requireMaintainer } from '~~/server/utils/security/requireMaintainer'

// GET /api/admin/me
//
// Lightweight maintainer probe for the admin-host middleware: returns
// { isMaintainer } instead of throwing, so the client/SSR can decide whether to
// render the admin surface or bounce the user. The /api/admin/* data endpoints
// still enforce requireMaintainer server-side regardless.

export default defineEventHandler(async (event) => {
  try {
    const m = await requireMaintainer(event)
    return { isMaintainer: true, email: m.email, isOwner: m.isOwner }
  }
  catch {
    return { isMaintainer: false, email: null }
  }
})
