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

/**
 * 批次取得股價（Yahoo Finance chart API + allorigins proxy）
 */
export async function fetchStockPrices(
  tickers: string[],
): Promise<Record<string, StockQuote>> {
  const now = Date.now()
  const needFetch = tickers.filter(
    (t) => !cacheTime.value[t] || now - cacheTime.value[t] > CACHE_MS,
  )

  await Promise.allSettled(
    needFetch.map(async (ticker) => {
      try {
        const yahooPath = `/v8/finance/chart/${encodeURIComponent(ticker)}?range=1d&interval=1d`
        const fetchUrl = import.meta.env.DEV
          ? `/yahoo-finance${yahooPath}`
          : `https://api.allorigins.win/raw?url=${encodeURIComponent(`https://query2.finance.yahoo.com${yahooPath}`)}`
        const res = await fetch(fetchUrl)
        if (!res.ok) return
        const data = await res.json()
        const meta = data?.chart?.result?.[0]?.meta
        if (!meta) return
        cache.value[ticker] = {
          price: meta.regularMarketPrice ?? 0,
          currency: meta.currency ?? 'USD',
          name: meta.shortName ?? meta.symbol ?? ticker,
        }
        cacheTime.value[ticker] = now
      } catch {
        // keep old cache if available
      }
    }),
  )

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
