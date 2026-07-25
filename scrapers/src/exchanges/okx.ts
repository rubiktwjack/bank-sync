import { createHmac } from 'node:crypto'
import { BaseExchange, type ExchangeCredentials } from './base-exchange.js'
import type { ScrapedForeignDeposit } from '../types.js'
import { logger } from '../utils/logger.js'

/**
 * OKX 交易所
 * API v5: https://www.okx.com/docs-v5/en/
 *
 * 簽名跟 BingX/Binance/Bybit 不同：
 * - prehash = timestamp(ISO8601) + method + requestPath(+query) + body
 * - sign = Base64(HMAC_SHA256(secretKey, prehash))，非 hex
 * - 需要額外的 OK-ACCESS-PASSPHRASE header
 */
export class OkxExchange extends BaseExchange {
  readonly exchangeId = 'okx'
  readonly exchangeName = 'OKX'

  private readonly baseUrl = 'https://www.okx.com'
  private readonly STABLECOINS = ['USDT', 'USDC', 'BUSD', 'DAI', 'FDUSD', 'TUSD', 'USDP']

  private async signedGet(
    path: string,
    credentials: ExchangeCredentials,
    queryString = '',
  ): Promise<any> {
    const timestamp = new Date().toISOString()
    const requestPath = queryString ? `${path}?${queryString}` : path
    const prehash = timestamp + 'GET' + requestPath
    const signature = createHmac('sha256', credentials.secretKey).update(prehash).digest('base64')

    const url = `${this.baseUrl}${requestPath}`
    return this.fetchJson(url, {
      'OK-ACCESS-KEY': credentials.apiKey,
      'OK-ACCESS-SIGN': signature,
      'OK-ACCESS-TIMESTAMP': timestamp,
      'OK-ACCESS-PASSPHRASE': credentials.passphrase ?? '',
    })
  }

  /** 查公開行情：幣種對 USDT 價格 */
  private async fetchPrices(symbols: string[]): Promise<Record<string, number>> {
    const prices: Record<string, number> = {}
    for (const s of this.STABLECOINS) prices[s] = 1

    const nonStable = symbols.filter(s => !(s in prices))
    if (nonStable.length === 0) return prices

    try {
      // OKX v5 公開 ticker（不需簽名）
      const data = await this.fetchJson(`${this.baseUrl}/api/v5/market/tickers?instType=SPOT`)
      for (const t of data.data ?? []) {
        // instId 格式: "BTC-USDT"
        const [base, quote] = (t.instId || '').split('-')
        const price = parseFloat(t.last || '0')
        if (price <= 0) continue
        if ((quote === 'USDT' || quote === 'USDC') && nonStable.includes(base)) {
          if (!prices[base] || quote === 'USDT') {
            prices[base] = price
          }
        }
      }
    } catch (e) {
      logger.warn(`[OKX] 查詢行情失敗: ${e}`)
    }

    return prices
  }

  /** 查 USDT/TWD 匯率 */
  private async fetchUsdtToTwd(): Promise<number> {
    try {
      const res = await fetch('https://open.er-api.com/v6/latest/USD')
      if (!res.ok) return 32.5
      const data = await res.json()
      return data.rates?.TWD ?? 32.5
    } catch {
      return 32.5
    }
  }

  async fetchBalances(credentials: ExchangeCredentials): Promise<ScrapedForeignDeposit[]> {
    const assets: { symbol: string; total: number }[] = []

    function addAsset(symbol: string, amount: number) {
      if (amount <= 0.000001) return
      const existing = assets.find(a => a.symbol === symbol)
      if (existing) existing.total += amount
      else assets.push({ symbol, total: amount })
    }

    // 1. Trading 帳戶（涵蓋 Spot/Margin/Futures/Swap/Options，視帳戶模式）
    try {
      const data = await this.signedGet('/api/v5/account/balance', credentials)
      if (data.code === '0') {
        for (const account of data.data ?? []) {
          for (const detail of account.details ?? []) {
            const bal = parseFloat(detail.cashBal || '0')
            addAsset(detail.ccy, bal)
          }
        }
        logger.info(`[OKX] Trading 帳戶查詢完成`)
      } else {
        logger.warn(`[OKX] Trading 帳戶查詢失敗: ${data.msg}`)
      }
    } catch (e) {
      logger.warn(`[OKX] Trading 帳戶查詢失敗: ${e}`)
    }

    // 2. Funding 帳戶（充提中轉帳戶）
    try {
      const data = await this.signedGet('/api/v5/asset/balances', credentials)
      if (data.code === '0') {
        for (const item of data.data ?? []) {
          const bal = parseFloat(item.bal || '0')
          addAsset(item.ccy, bal)
        }
        logger.info(`[OKX] Funding 帳戶查詢完成`)
      } else {
        logger.warn(`[OKX] Funding 帳戶查詢失敗: ${data.msg}`)
      }
    } catch (e) {
      logger.warn(`[OKX] Funding 帳戶查詢失敗: ${e}`)
    }

    // 3. Savings 帳戶（活期生息）
    try {
      const data = await this.signedGet('/api/v5/finance/savings/balance', credentials)
      if (data.code === '0') {
        for (const item of data.data ?? []) {
          const bal = parseFloat(item.amt || '0')
          addAsset(item.ccy, bal)
        }
        logger.info(`[OKX] Savings 帳戶查詢完成`)
      } else {
        logger.warn(`[OKX] Savings 帳戶查詢失敗: ${data.msg}`)
      }
    } catch (e) {
      logger.warn(`[OKX] Savings 帳戶查詢失敗: ${e}`)
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
      logger.info(`[OKX] ${symbol}: ${total} (≈ NT$${Math.round(twdVal).toLocaleString()})`)
    }

    return balances
  }
}
