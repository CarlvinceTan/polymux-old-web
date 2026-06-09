import { getRequestURL } from 'h3'

/** Vite/PostHog worker chunks at the site root (e.g. session replay). */
const ROOT_WORKER_ASSET_RE = /\/[^/]*-worker-[^/]*\.(js|mjs)$/

/**
 * PostHog session replay ships an inline worker whose sourceMappingURL points at
 * /image-bitmap-data-url-worker-<hash>.js.map on this origin. That file does not
 * exist; Nuxt would otherwise render the HTML 404 page and Vue Router warns
 * "No match found" during SSR/hydration. Return a plain 404 for asset-like paths.
 */
export default defineEventHandler((event) => {
  const pathname = getRequestURL(event).pathname
  if (pathname.endsWith('.map') || ROOT_WORKER_ASSET_RE.test(pathname)) {
    setResponseStatus(event, 404, 'Not Found')
    setHeader(event, 'content-type', 'text/plain; charset=utf-8')
    setHeader(event, 'cache-control', 'no-store')
    return 'Not Found'
  }
})
