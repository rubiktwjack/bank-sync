import { BaseExchange, type ExchangeCredentials } from './base-exchange.js'
import type { ScrapedForeignDeposit } from '../types.js'
import { logger } from '../utils/logger.js'

/**
 * BingX 交易所
 * API: https://bingx-api.github.io/docs/
 * Spot 餘額: GET /openApi/spot/v1/account/balance
 */
export class BingxExchange extends BaseExchange {
  readonly exchangeId = 'bingx'
  readonly exchangeName = 'BingX'

  private readonly baseUrl = 'https://open-api.bingx.com'

  /** 查公開行情：幣種對 USDT 價格 */
  private async fetchPrices(symbols: string[]): Promise<Record<string, number>> {
    const prices: Record<string, number> = {}
    // 穩定幣直接設 1
    for (const s of ['USDT', 'USDC', 'BUSD', 'DAI', 'FDUSD']) prices[s] = 1

    const nonStable = symbols.filter(s => !(s in prices))
    if (nonStable.length === 0) return prices

    try {
      // BingX 公開 ticker/price API（不需簽名）
      const res = await fetch(`${this.baseUrl}/openApi/spot/v1/ticker/price`)
      if (!res.ok) throw new Error(`ticker HTTP ${res.status}`)
      const data = await res.json()
      const tickers: any[] = data.data ?? []

      for (const t of tickers) {
        // symbol 格式: "BTC_USDT" 或 "ARB_USDC"
        const [base, quote] = (t.symbol || '').split('_')
        if ((quote === 'USDT' || quote === 'USDC') && nonStable.includes(base)) {
          const price = parseFloat(t.trades?.[0]?.price || '0')
          // 優先 USDT 交易對
          if (price > 0 && (!prices[base] || quote === 'USDT')) {
            prices[base] = price
          }
        }
      }
    } catch (e) {
      logger.warn(`[BingX] 查詢行情失敗: ${e}`)
    }

    return prices
  }

  /** 查 USDT/TWD 匯率 */
  private async fetchUsdtToTwd(): Promise<number> {
    try {
      const res = await fetch('https://open.er-api.com/v6/latest/USD')
      if (!res.ok) return 32.5 // fallback
      const data = await res.json()
      return data.rates?.TWD ?? 32.5
    } catch {
      return 32.5
    }
  }

  /** 簽名並呼叫 API */
  private async signedGet(path: string, credentials: ExchangeCredentials): Promise<any> {
    const timestamp = Date.now().toString()
    const params = `timestamp=${timestamp}`
    const signature = this.hmacSign(credentials.secretKey, params)
    const url = `${this.baseUrl}${path}?${params}&signature=${signature}`
    return this.fetchJson(url, { 'X-BX-APIKEY': credentials.apiKey })
  }

  async fetchBalances(credentials: ExchangeCredentials): Promise<ScrapedForeignDeposit[]> {
    // 合併 Spot + 合約帳戶餘額
    const assets: { symbol: string; total: number }[] = []

    // 1. Spot 帳戶
    const spotData = await this.signedGet('/openApi/spot/v1/account/balance', credentials)
    if (spotData.code === 0) {
      for (const asset of spotData.data?.balances ?? []) {
        const free = parseFloat(asset.free || '0')
        const locked = parseFloat(asset.locked || '0')
        const total = free + locked
        if (total > 0.000001) {
          assets.push({ symbol: asset.asset, total })
        }
      }
    }

    // 2. U本位合約帳戶 (Swap/Perpetual)
    const swapData = await this.signedGet('/openApi/swap/v3/user/balance', credentials)
    if (swapData.code === 0) {
      for (const item of Array.isArray(swapData.data) ? swapData.data : [swapData.data]) {
        const bal = parseFloat(item?.balance || '0')
        if (bal > 0.01) {
          const sym = item.asset || 'USDT'
          const existing = assets.find(a => a.symbol === sym)
          if (existing) existing.total += bal
          else assets.push({ symbol: sym, total: bal })
        }
      }
    }

    // 3. 幣本位合約帳戶 (Coin-M)
    const cswapData = await this.signedGet('/openApi/cswap/v1/user/balance', credentials)
    if (cswapData.code === 0) {
      for (const item of cswapData.data ?? []) {
        const bal = parseFloat(item?.balance || '0')
        if (bal > 0.000001) {
          const sym = item.asset
          const existing = assets.find(a => a.symbol === sym)
          if (existing) existing.total += bal
          else assets.push({ symbol: sym, total: bal })
        }
      }
    }

    // 4. 資金帳戶 (Fund)
    const fundData = await this.signedGet('/openApi/fund/v1/account/balance', credentials)
    if (fundData.code === 0) {
      for (const item of fundData.data?.assets ?? []) {
        const free = parseFloat(item?.free || '0')
        const locked = parseFloat(item?.locked || '0')
        const bal = free + locked
        if (bal > 0.000001) {
          const sym = item.asset
          const existing = assets.find(a => a.symbol === sym)
          if (existing) existing.total += bal
          else assets.push({ symbol: sym, total: bal })
        }
      }
    }

    // 查行情 + 匯率
    const symbols = assets.map(a => a.symbol)
    const [prices, usdtToTwd] = await Promise.all([
      this.fetchPrices(symbols),
      this.fetchUsdtToTwd(),
    ])

    const balances: ScrapedForeignDeposit[] = []
    for (const { symbol, total } of assets) {
      const priceUsdt = prices[symbol] ?? 0
      const exchangeRate = priceUsdt * usdtToTwd
      const twdVal = total * exchangeRate
      // 過濾無價格或台幣價值不到 1 元的灰塵
      if (priceUsdt === 0 || twdVal < 1) continue
      balances.push({
        accountNumber: '',
        balance: total,
        currency: symbol,
        exchangeRate,
      })
      logger.info(`[BingX] ${symbol}: ${total} (≈ NT$${Math.round(twdVal).toLocaleString()})`)
    }

    return balances
  }
}
