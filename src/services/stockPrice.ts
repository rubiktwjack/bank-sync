import { ref } from 'vue'
import { toTWD } from './exchangeRate'

export interface StockQuote {
  price: number
  currency: string
  name: string
}

const cache = ref<Record<string, StockQuote>>({})
const cacheTime = ref<Record<string, number>>({})
const CACHE_MS = 30 * 60 * 1000

// 靜態股價資料（由 GitHub Actions 產生）
let staticPrices: Record<string, StockQuote> | null = null

async function loadStaticPrices(): Promise<Record<string, StockQuote>> {
  if (staticPrices) return staticPrices
  try {
    const base = import.meta.env.BASE_URL || '/'
    const res = await fetch(`${base}data/stock-prices.json`)
    if (!res.ok) return {}
    staticPrices = await res.json()
    return staticPrices!
  } catch {
    return {}
  }
}

async function fetchFromYahoo(ticker: string): Promise<StockQuote | null> {
  const yahooPath = `/v8/finance/chart/${encodeURIComponent(ticker)}?range=1d&interval=1d`
  const res = await fetch(`/yahoo-finance${yahooPath}`)
  if (!res.ok) return null
  const data = await res.json()
  const meta = data?.chart?.result?.[0]?.meta
  if (!meta) return null
  return {
    price: meta.regularMarketPrice ?? 0,
    currency: meta.currency ?? 'USD',
    name: meta.shortName ?? meta.symbol ?? ticker,
  }
}

/**
 * 批次取得股價
 * - Dev: 透過 Vite proxy 即時查 Yahoo Finance
 * - Production: 讀取靜態 stock-prices.json（由 Actions 定時更新）
 */
export async function fetchStockPrices(
  tickers: string[],
): Promise<Record<string, StockQuote>> {
  const now = Date.now()

  if (import.meta.env.DEV) {
    const needFetch = tickers.filter(
      (t) => !cacheTime.value[t] || now - cacheTime.value[t] > CACHE_MS,
    )
    await Promise.allSettled(
      needFetch.map(async (ticker) => {
        try {
          const quote = await fetchFromYahoo(ticker)
          if (quote) {
            cache.value[ticker] = quote
            cacheTime.value[ticker] = now
          }
        } catch { /* ignore */ }
      }),
    )
  } else {
    const prices = await loadStaticPrices()
    for (const t of tickers) {
      if (prices[t]) {
        cache.value[t] = prices[t]
        cacheTime.value[t] = now
      }
    }
  }

  const result: Record<string, StockQuote> = {}
  for (const t of tickers) {
    if (cache.value[t]) result[t] = cache.value[t]
  }
  return result
}

/**
 * 計算單一持倉的 TWD 市值
 */
export function stockMarketValueTWD(
  shares: number,
  quote: StockQuote | undefined,
): number {
  if (!quote) return 0
  const value = shares * quote.price
  return quote.currency === 'TWD' ? value : toTWD(value, quote.currency)
}
