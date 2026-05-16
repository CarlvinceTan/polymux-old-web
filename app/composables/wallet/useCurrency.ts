export type SupportedCurrency = 'usd' | 'eur' | 'gbp' | 'aud' | 'cad' | 'jpy' | 'brl' | 'krw' | 'cny'

export const CURRENCY_OPTIONS: { value: SupportedCurrency; label: string; symbol: string }[] = [
  { value: 'usd', label: 'USD ($)', symbol: '$' },
  { value: 'eur', label: 'EUR (€)', symbol: '€' },
  { value: 'gbp', label: 'GBP (£)', symbol: '£' },
  { value: 'aud', label: 'AUD (A$)', symbol: 'A$' },
  { value: 'cad', label: 'CAD (C$)', symbol: 'C$' },
  { value: 'jpy', label: 'JPY (¥)', symbol: '¥' },
  { value: 'brl', label: 'BRL (R$)', symbol: 'R$' },
  { value: 'krw', label: 'KRW (₩)', symbol: '₩' },
  { value: 'cny', label: 'CNY (元)', symbol: '元' },
]

export interface PriceData {
  free: { monthly: string; annualPerMonth: string }
  pro: { monthly: string; annualPerMonth: string }
  max: { monthly: string; annualPerMonth: string }
  enterprise: { monthly: string; annualPerMonth: string }
}

export function useCurrency() {
  const currency = useState<SupportedCurrency>('pricing-currency', () => 'usd')
  const prices = useState<PriceData | null>('pricing-prices', () => null)
  const loading = useState('pricing-loading', () => false)
  const detected = useState('pricing-detected', () => false)

  async function detect() {
    if (detected.value) return
    try {
      const saved = useCookie<SupportedCurrency | undefined>('polymux_currency')
      if (saved.value && CURRENCY_OPTIONS.some(o => o.value === saved.value)) {
        currency.value = saved.value
      }
      else {
        const geo = await $fetch<{ currency: SupportedCurrency }>('/api/geo')
        currency.value = geo.currency
        saved.value = geo.currency
      }
    }
    catch {
      currency.value = 'usd'
    }
    detected.value = true
    await fetchPrices()
  }

  async function fetchPrices() {
    loading.value = true
    try {
      prices.value = await $fetch<PriceData>('/api/prices', {
        query: { currency: currency.value },
      })
    }
    catch {
      prices.value = null
    }
    finally {
      loading.value = false
    }
  }

  async function setCurrency(c: SupportedCurrency) {
    currency.value = c
    const cookie = useCookie<SupportedCurrency>('polymux_currency')
    cookie.value = c
    await fetchPrices()
  }

  return {
    currency,
    prices,
    loading,
    detected,
    detect,
    setCurrency,
    currencyOptions: CURRENCY_OPTIONS,
  }
}
