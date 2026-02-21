import { BaseExchange, type ExchangeCredentials } from './base-exchange.js'
import type { ScrapedForeignDeposit } from '../types.js'
import { logger } from '../utils/logger.js'

/**
 * Binance 交易所
 * 查詢 5 種帳戶：Spot + U-M Futures + Coin-M Futures + Funding + Earn
 */
export class BinanceExchange extends BaseExchange {
  readonly exchangeId = 'binance'
  readonly exchangeName = 'Binance'

  private readonly baseUrl = 'https://api.binance.com'
  private readonly fapiUrl = 'https://fapi.binance.com'
  private readonly dapiUrl = 'https://dapi.binance.com'

  /** 穩定幣清單（USDT 計價 = 1） */
  private readonly STABLECOINS = ['USDT', 'USDC', 'BUSD', 'DAI', 'FDUSD', 'TUSD', 'USDP']

  /** 帶簽名的 GET 請求 */
  private async signedGet(
    baseUrl: string,
    path: string,
    credentials: ExchangeCredentials,
    extraParams = '',
  ): Promise<any> {
    const timestamp = Date.now().toString()
    const params = extraParams
      ? `${extraParams}&timestamp=${timestamp}`
      : `timestamp=${timestamp}`
    const signature = this.hmacSign(credentials.secretKey, params)
    const url = `${baseUrl}${path}?${params}&signature=${signature}`
    return this.fetchJson(url, { 'X-MBX-APIKEY': credentials.apiKey })
  }

  /** 帶簽名的 POST 請求 */
  private async signedPost(
    baseUrl: string,
    path: string,
    credentials: ExchangeCredentials,
    extraParams = '',
  ): Promise<any> {
    const timestamp = Date.now().toString()
    const params = extraParams
      ? `${extraParams}&timestamp=${timestamp}`
      : `timestamp=${timestamp}`
    const signature = this.hmacSign(credentials.secretKey, params)
    const url = `${baseUrl}${path}?${params}&signature=${signature}`
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'X-MBX-APIKEY': credentials.apiKey },
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`HTTP ${res.status}: ${text}`)
    }
    return res.json()
  }

  /** 查公開行情：幣種對 USDT 價格 */
  private async fetchPrices(symbols: string[]): Promise<Record<string, number>> {
    const prices: Record<string, number> = {}
    for (const s of this.STABLECOINS) prices[s] = 1

    const nonStable = symbols.filter(s => !(s in prices))
    if (nonStable.length === 0) return prices

    try {
      // Binance 公開 ticker API（不需簽名）
      const data = await this.fetchJson(`${this.baseUrl}/api/v3/ticker/price`)
      for (const t of data) {
        const sym: string = t.symbol || ''
        const price = parseFloat(t.price || '0')
        if (price <= 0) continue

        // 嘗試匹配 XXXUSDT 或 XXXUSDC
        for (const quote of ['USDT', 'USDC']) {
          if (sym.endsWith(quote)) {
            const base = sym.slice(0, -quote.length)
            if (nonStable.includes(base)) {
              // 優先 USDT 交易對
              if (!prices[base] || quote === 'USDT') {
                prices[base] = price
              }
            }
          }
        }
      }
    } catch (e) {
      logger.warn(`[Binance] 查詢行情失敗: ${e}`)
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

    // 1. Spot 帳戶 — GET /api/v3/account
    //    注意：LD 開頭的代幣是 Earn 包裝代幣（如 LDUSDT = Earn Flexible 的 USDT），
    //    實際餘額在 Earn 帳戶查詢，這裡要過濾掉避免重複計算
    try {
      const spotData = await this.signedGet(this.baseUrl, '/api/v3/account', credentials)
      for (const b of spotData.balances ?? []) {
        if ((b.asset as string).startsWith('LD')) continue // Earn 包裝代幣，跳過
        const free = parseFloat(b.free || '0')
        const locked = parseFloat(b.locked || '0')
        addAsset(b.asset, free + locked)
      }
      logger.info(`[Binance] Spot 帳戶查詢完成`)
    } catch (e) {
      logger.warn(`[Binance] Spot 帳戶查詢失敗: ${e}`)
    }

    // 2. U-M Futures 帳戶 — GET /fapi/v3/balance
    try {
      const futuresData = await this.signedGet(this.fapiUrl, '/fapi/v3/balance', credentials)
      for (const item of Array.isArray(futuresData) ? futuresData : []) {
        const bal = parseFloat(item.balance || '0')
        addAsset(item.asset, bal)
      }
      logger.info(`[Binance] U-M Futures 帳戶查詢完成`)
    } catch (e) {
      logger.warn(`[Binance] U-M Futures 帳戶查詢失敗: ${e}`)
    }

    // 3. Coin-M Futures 帳戶 — GET /dapi/v1/balance
    try {
      const coinmData = await this.signedGet(this.dapiUrl, '/dapi/v1/balance', credentials)
      for (const item of Array.isArray(coinmData) ? coinmData : []) {
        const bal = parseFloat(item.balance || '0')
        addAsset(item.asset, bal)
      }
      logger.info(`[Binance] Coin-M Futures 帳戶查詢完成`)
    } catch (e) {
      logger.warn(`[Binance] Coin-M Futures 帳戶查詢失敗: ${e}`)
    }

    // 4. Funding 帳戶 — POST /sapi/v1/asset/get-funding-asset
    try {
      const fundingData = await this.signedPost(this.baseUrl, '/sapi/v1/asset/get-funding-asset', credentials)
      for (const item of Array.isArray(fundingData) ? fundingData : []) {
        const free = parseFloat(item.free || '0')
        const locked = parseFloat(item.locked || '0')
        const freeze = parseFloat(item.freeze || '0')
        addAsset(item.asset, free + locked + freeze)
      }
      logger.info(`[Binance] Funding 帳戶查詢完成`)
    } catch (e) {
      logger.warn(`[Binance] Funding 帳戶查詢失敗: ${e}`)
    }

    // 5. Simple Earn 帳戶 — GET /sapi/v1/simple-earn/account
    try {
      const earnData = await this.signedGet(this.baseUrl, '/sapi/v1/simple-earn/account', credentials)
      // earnData 有 totalAmountInUSDT 等總覽，但為了分幣種需要查 flexible/locked positions
      // 查 Flexible 產品持倉
      const flexData = await this.signedGet(this.baseUrl, '/sapi/v1/simple-earn/flexible/position', credentials, 'size=100')
      for (const item of flexData.rows ?? []) {
        const amount = parseFloat(item.totalAmount || '0')
        addAsset(item.asset, amount)
      }
      // 查 Locked 產品持倉
      const lockedData = await this.signedGet(this.baseUrl, '/sapi/v1/simple-earn/locked/position', credentials, 'size=100')
      for (const item of lockedData.rows ?? []) {
        const amount = parseFloat(item.amount || '0')
        addAsset(item.asset, amount)
      }
      logger.info(`[Binance] Earn 帳戶查詢完成`)
    } catch (e) {
      logger.warn(`[Binance] Earn 帳戶查詢失敗: ${e}`)
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
      logger.info(`[Binance] ${symbol}: ${total} (≈ NT$${Math.round(twdVal).toLocaleString()})`)
    }

    return balances
  }
}
