/**
 * 抓取全台股 + 常用美股收盤價，輸出 stock-prices.json
 * 由 GitHub Actions 在爬蟲後執行
 *
 * 台股：TWSE OpenAPI (上市) + TPEX (上櫃)
 * 美股：Yahoo Finance chart API（server-side 無 CORS 問題）
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

interface StockQuote {
  price: number
  currency: string
  name: string
}

// 從 watchlist 讀取美股清單
function loadWatchlist(): string[] {
  try {
    const path = resolve(__dirname, '../../data/stock-watchlist.json')
    return JSON.parse(readFileSync(path, 'utf-8'))
  } catch {
    return []
  }
}

async function fetchTWSE(): Promise<Record<string, StockQuote>> {
  const result: Record<string, StockQuote> = {}

  // 上市股票
  try {
    const res = await fetch('https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_AVG_ALL')
    if (res.ok) {
      const data: Array<{ Code: string; Name: string; ClosingPrice: string }> = await res.json()
      for (const item of data) {
        const price = parseFloat(item.ClosingPrice)
        if (!price || isNaN(price)) continue
        result[`${item.Code}.TW`] = {
          price,
          currency: 'TWD',
          name: item.Name,
        }
      }
    }
  } catch (e) {
    console.error('TWSE fetch failed:', e)
  }

  // 上櫃股票
  try {
    const res = await fetch('https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes')
    if (res.ok) {
      const data: Array<{ SecuritiesCompanyCode: string; CompanyName: string; ClosingPrice: string }> = await res.json()
      for (const item of data) {
        const price = parseFloat(item.ClosingPrice)
        if (!price || isNaN(price)) continue
        result[`${item.SecuritiesCompanyCode}.TWO`] = {
          price,
          currency: 'TWD',
          name: item.CompanyName,
        }
      }
    }
  } catch (e) {
    console.error('TPEX fetch failed:', e)
  }

  return result
}

async function fetchUSStocks(): Promise<Record<string, StockQuote>> {
  const result: Record<string, StockQuote> = {}

  const tickers = loadWatchlist()
  console.log(`Watchlist: ${tickers.length} tickers`)

  await Promise.allSettled(
    tickers.map(async (ticker) => {
      try {
        const url = `https://query2.finance.yahoo.com/v8/finance/chart/${ticker}?range=1d&interval=1d`
        const res = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0' },
          signal: AbortSignal.timeout(10000),
        })
        if (!res.ok) return
        const data = await res.json()
        const meta = data?.chart?.result?.[0]?.meta
        if (!meta) return
        result[ticker] = {
          price: meta.regularMarketPrice ?? 0,
          currency: meta.currency ?? 'USD',
          name: meta.shortName ?? meta.symbol ?? ticker,
        }
      } catch { /* ignore */ }
    }),
  )

  return result
}

async function main() {
  console.log('Fetching TWSE + TPEX stock prices...')
  const twPrices = await fetchTWSE()
  console.log(`Got ${Object.keys(twPrices).length} TW stocks`)

  console.log('Fetching US stock prices...')
  const usPrices = await fetchUSStocks()
  console.log(`Got ${Object.keys(usPrices).length} US stocks`)

  const all = { ...twPrices, ...usPrices }
  const outPath = resolve(__dirname, '../../data/stock-prices.json')
  writeFileSync(outPath, JSON.stringify(all))
  console.log(`Written ${Object.keys(all).length} stocks to ${outPath}`)

  // 也複製到 public/data/ 供本地測試
  const publicPath = resolve(__dirname, '../../public/data/stock-prices.json')
  writeFileSync(publicPath, JSON.stringify(all))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
