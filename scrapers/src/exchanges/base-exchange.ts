import { createHmac } from 'node:crypto'
import { logger } from '../utils/logger.js'
import type { BankScrapedData, ScrapedForeignDeposit } from '../types.js'

export interface ExchangeCredentials {
  apiKey: string
  secretKey: string
}

/**
 * 加密貨幣交易所基底類別
 * 所有交易所都用 HMAC SHA256 簽名 + REST API
 */
export abstract class BaseExchange {
  abstract readonly exchangeId: string
  abstract readonly exchangeName: string

  protected hmacSign(secret: string, message: string): string {
    return createHmac('sha256', secret).update(message).digest('hex')
  }

  protected async fetchJson(url: string, headers: Record<string, string> = {}): Promise<any> {
    const res = await fetch(url, { headers })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`HTTP ${res.status}: ${text}`)
    }
    return res.json()
  }

  abstract fetchBalances(credentials: ExchangeCredentials): Promise<ScrapedForeignDeposit[]>

  async run(credentials: ExchangeCredentials): Promise<BankScrapedData> {
    const startTime = Date.now()
    try {
      const balances = await this.fetchBalances(credentials)
      logger.info(`[${this.exchangeName}] 取得 ${balances.length} 筆資產`)
      return {
        bankId: this.exchangeId,
        bankName: this.exchangeName,
        scrapedAt: new Date().toISOString(),
        success: true,
        deposits: [],
        foreignDeposits: balances,
        creditCards: [],
        loans: [],
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      logger.error(`[${this.exchangeName}] 失敗: ${msg}`)
      return {
        bankId: this.exchangeId,
        bankName: this.exchangeName,
        scrapedAt: new Date().toISOString(),
        success: false,
        error: msg,
        deposits: [],
        foreignDeposits: [],
        creditCards: [],
        loans: [],
      }
    }
  }
}
