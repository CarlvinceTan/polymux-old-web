/**
 * Untyped wrapper around `$fetch`. Nitro's typed-routes feature inflates the
 * path conditional with every server route's `infer` chain. On a project with
 * many routes this blows the TS stack-depth limit anywhere `$fetch` is called
 * with a string variable. This wrapper exposes a clean `<T>` generic so
 * callers retain return-type narrowing without dragging in the deep route
 * inference.
 *
 * Use everywhere we'd otherwise call `$fetch<T>(path, ...)`.
 */
export const apiFetch = $fetch as unknown as <U>(
  path: string,
  opts?: Record<string, unknown>,
) => Promise<U>
