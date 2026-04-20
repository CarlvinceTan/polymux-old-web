/**
 * Signed-out users are guests: all routes are reachable from the client.
 * Limits and enforcement belong in APIs, Supabase RLS, and plan checks — not here.
 */
export default defineNuxtRouteMiddleware(() => {})
