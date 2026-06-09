import type { Plugin } from 'vite'

const SOURCEMAP_COMMENT_RE =
  /\/\/# sourceMappingURL=image-bitmap-data-url-worker[^\n\r]*\r?\n?/g

/**
 * PostHog's lazy session recorder embeds a worker blob with a root-relative
 * sourceMappingURL that does not exist on our origin. Strip it when Vite bundles
 * posthog-js so DevTools do not request bogus .map files.
 */
export function stripPosthogWorkerSourceMap(): Plugin {
  return {
    name: 'polymux:strip-posthog-worker-sourcemap',
    enforce: 'pre',
    transform(code, id) {
      if (!id.includes('posthog-js') || !code.includes('image-bitmap-data-url-worker')) {
        return
      }
      const next = code.replace(SOURCEMAP_COMMENT_RE, '')
      if (next === code) return
      return { code: next, map: null }
    },
  }
}
