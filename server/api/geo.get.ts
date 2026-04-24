export default defineEventHandler((event) => {
  const headers = getHeaders(event)

  const country
    = headers['cf-ipcountry']
    || headers['x-vercel-ip-country']
    || headers['x-country-code']
    || parseAcceptLanguageCountry(headers['accept-language'])
    || 'US'

  const currency = countryToCurrency(country)

  return { country: country.toUpperCase(), currency }
})

/**
 * Best-effort country extraction from Accept-Language.
 * e.g. "en-AU,en;q=0.9" → "AU"
 */
function parseAcceptLanguageCountry(header: string | undefined): string | null {
  if (!header) return null
  const match = header.match(/[a-z]{2}-([A-Z]{2})/)
  return match?.[1] ?? null
}
