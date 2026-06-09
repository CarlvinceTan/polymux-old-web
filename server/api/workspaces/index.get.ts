// Workspace listing is handled by the Go backend at SERVER_URL/workspaces.
// This stub exists so that any stray GET /api/workspaces request returns a
// clean 404 from Nitro rather than falling through to Vue Router (which would
// log "[Vue Router warn]: No match found for location with path /api/workspaces").
export default defineEventHandler(() => {
  throw createError({ statusCode: 404, message: 'Not found' })
})
