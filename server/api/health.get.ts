// Same-origin health probe for the browser. Nitro checks the Go backend directly.
export default defineEventHandler(async (event) => {
  const { public: { serverUrl } } = useRuntimeConfig()
  if (!serverUrl) {
    throw createError({ statusCode: 503, statusMessage: 'Polymux server URL not configured.' })
  }

  setHeader(event, 'cache-control', 'no-store')

  try {
    return await ($fetch as Function)(`${serverUrl}/health`, { timeout: 4_000 })
  }
  catch {
    throw createError({ statusCode: 503, statusMessage: 'Backend unavailable.' })
  }
})
