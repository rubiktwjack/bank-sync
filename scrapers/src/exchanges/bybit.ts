import { BaseExchange, type ExchangeCredentials } from './base-exchange.js'
import type { ScrapedForeignDeposit } from '../types.js'
import { logger } from '../utils/logger.js'

/**
 * Bybit 交易所（Unified Trading Account）
 * API v5: https://bybit-exchange.github.io/docs/v5/intro
 *
 * Unified Account 一個 endpoint 就能查所有帳戶餘額（Spot + Derivatives + Earn）
 * 另外查 Funding 帳戶
 */
export class BybitExchange extends BaseExchange {
  readonly exchangeId = 'bybit'
  readonly exchangeName = 'Bybit'

  private readonly baseUrl = 'https://api.bybit.com'
  private readonly STABLECOINS = ['USDT', 'USDC', 'BUSD', 'DAI', 'FDUSD', 'TUSD', 'USDP']
  private readonly RECV_WINDOW = '5000'

  /**
   * Bybit v5 簽名：HMAC_SHA256(timestamp + apiKey + recvWindow + queryString)
   * 跟 BingX/Binance 不同，簽名內容包含 apiKey
   */
  private async signedGet(
    path: string,
    credentials: ExchangeCredentials,
    queryString = '',
  ): Promise<any> {
    const timestamp = Date.now().toString()
    const signPayload = timestamp + credentials.apiKey + this.RECV_WINDOW + queryString
    const signature = this.hmacSign(credentials.secretKey, signPayload)

    const url = `${this.baseUrl}${path}${queryString ? '?' + queryString : ''}`
    return this.fetchJson(url, {
      'X-BAPI-API-KEY': credentials.apiKey,
      'X-BAPI-SIGN': signature,
      'X-BAPI-TIMESTAMP': timestamp,
      'X-BAPI-RECV-WINDOW': this.RECV_WINDOW,
    })
  }

  /** 查公開行情：幣種對 USDT 價格 */
  private async fetchPrices(symbols: string[]): Promise<Record<string, number>> {
    const prices: Record<string, number> = {}
    for (const s of this.STABLECOINS) prices[s] = 1

    const nonStable = symbols.filter(s => !(s in prices))
    if (nonStable.length === 0) return prices

    try {
      // Bybit v5 公開 ticker（不需簽名）
      const data = await this.fetchJson(`${this.baseUrl}/v5/market/tickers?category=spot`)
      for (const t of data.result?.list ?? []) {
        const sym: string = t.symbol || ''
        const price = parseFloat(t.lastPrice || '0')
        if (price <= 0) continue

        for (const quote of ['USDT', 'USDC']) {
          if (sym.endsWith(quote)) {
            const base = sym.slice(0, -quote.length)
            if (nonStable.includes(base)) {
              if (!prices[base] || quote === 'USDT') {
                prices[base] = price
              }
            }
          }
        }
      }
    } catch (e) {
      logger.warn(`[Bybit] 查詢行情失敗: ${e}`)
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

    // 1. Unified Account（包含 Spot + Derivatives + Earn）
    //    一次查完所有有餘額的幣，不需指定 coin
    try {
      const data = await this.signedGet('/v5/account/wallet-balance', credentials, 'accountType=UNIFIED')
      if (data.retCode === 0) {
        for (const account of data.result?.list ?? []) {
          for (const coin of account.coin ?? []) {
            const walletBal = parseFloat(coin.walletBalance || '0')
            addAsset(coin.coin, walletBal)
          }
        }
        logger.info(`[Bybit] Unified 帳戶查詢完成`)
      } else {
        logger.warn(`[Bybit] Unified 帳戶查詢失敗: ${data.retMsg}`)
      }
    } catch (e) {
      logger.warn(`[Bybit] Unified 帳戶查詢失敗: ${e}`)
    }

    // 2. Funding 帳戶（充提中轉帳戶）
    //    2025/01/09 後需指定 coin，先查有哪些幣再逐一查
    //    用 /v5/asset/transfer/query-account-coins-balance
    try {
      // 先用常見幣種查（最多 10 個）
      const commonCoins = ['BTC', 'ETH', 'USDT', 'USDC', 'BNB', 'SOL', 'XRP', 'DOGE', 'ADA', 'AVAX']
      const qs = `accountType=FUND&coin=${commonCoins.join(',')}`
      const data = await this.signedGet('/v5/asset/transfer/query-account-coins-balance', credentials, qs)
      if (data.retCode === 0) {
        for (const b of data.result?.balance ?? []) {
          const bal = parseFloat(b.walletBalance || '0')
          addAsset(b.coin, bal)
        }
        logger.info(`[Bybit] Funding 帳戶查詢完成`)
      } else {
        logger.warn(`[Bybit] Funding 帳戶查詢失敗: ${data.retMsg}`)
      }
    } catch (e) {
      logger.warn(`[Bybit] Funding 帳戶查詢失敗: ${e}`)
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
      logger.info(`[Bybit] ${symbol}: ${total} (≈ NT$${Math.round(twdVal).toLocaleString()})`)
    }

    return balances
  }
}
