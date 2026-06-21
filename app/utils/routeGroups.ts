/**
 * Centralised route-prefix lists used by auth middleware, the
 * account-access middleware, and the auth-back-tracker plugin.
 *
 * `hasPrefix(path, list)` matches both the bare prefix (`/workflow`) and
 * any nested route under it (`/workflow/123`).
 */

export const AUTH_PREFIXES = [
  '/sign-in',
  '/admin-sign-in',
  '/sign-up',
  '/confirm',
  '/forgot-password',
  '/reset-password',
] as const

export const PROTECTED_PREFIXES = [
  '/workflow',
  '/dashboard',
  '/storage',
  '/vault',
  '/integrations',
  '/session',
  '/admin',
] as const

export const ALWAYS_ALLOW = [
  '/account-suspended',
  '/sign-in',
  '/admin-sign-in',
  '/sign-up',
  '/forgot-password',
  '/reset-password',
  '/verify-email',
  '/verification-successful',
  '/confirm',
] as const

export function hasPrefix(path: string, prefixes: readonly string[]): boolean {
  return prefixes.some(p => path === p || path.startsWith(p + '/'))
}

export function isProtectedPath(path: string): boolean {
  return hasPrefix(path, PROTECTED_PREFIXES)
}

export function isAlwaysAllowed(path: string): boolean {
  return hasPrefix(path, ALWAYS_ALLOW)
}
