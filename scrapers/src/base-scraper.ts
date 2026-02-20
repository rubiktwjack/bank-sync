import { type Browser, type BrowserContext, type Page } from 'playwright'
import { chromium } from 'playwright-extra'
import StealthPlugin from 'puppeteer-extra-plugin-stealth'

chromium.use(StealthPlugin())
import type { BankCredentials, BankScrapedData, ScrapedDeposit, ScrapedForeignDeposit, ScrapedCreditCard, ScrapedLoan } from './types.js'
import { logger } from './utils/logger.js'

/**
 * 銀行爬蟲基底類別
 *
 * 每家銀行繼承此類別，實作：
 * - login()：登入銀行網站
 * - scrapeDeposits()：爬台幣存款
 * - scrapeForeignDeposits()：爬外幣存款
 * - scrapeCreditCards()：爬信用卡
 * - scrapeLoans()：爬貸款
 *
 * 不是每家銀行都有所有帳戶類型，
 * 預設實作回傳空陣列，子類別只需覆寫有的部分。
 */
export abstract class BaseScraper {
  abstract readonly bankId: string
  abstract readonly bankName: string
  abstract readonly loginUrl: string

  protected browser: Browser | null = null
  protected context: BrowserContext | null = null
  protected page: Page | null = null

  // ─── 子類別必須實作 ───

  /** 登入銀行網站，成功回傳 true */
  abstract login(page: Page, credentials: BankCredentials): Promise<boolean>

  // ─── 子類別可選擇性覆寫（預設回傳空陣列）───

  async scrapeDeposits(_page: Page): Promise<ScrapedDeposit[]> {
    return []
  }

  async scrapeForeignDeposits(_page: Page): Promise<ScrapedForeignDeposit[]> {
    return []
  }

  async scrapeCreditCards(_page: Page): Promise<ScrapedCreditCard[]> {
    return []
  }

  async scrapeLoans(_page: Page): Promise<ScrapedLoan[]> {
    return []
  }

  // ─── 主執行流程（不需覆寫）───

  async run(credentials: BankCredentials, options: { headless: boolean; timeout: number }): Promise<BankScrapedData> {
    const result: BankScrapedData = {
      bankId: this.bankId,
      bankName: this.bankName,
      scrapedAt: new Date().toISOString(),
      success: false,
      deposits: [],
      foreignDeposits: [],
      creditCards: [],
      loans: [],
    }

    try {
      logger.info(`[${this.bankName}] 啟動瀏覽器...`)
      this.browser = await chromium.launch({
        headless: options.headless,
        channel: 'chrome',
      })
      this.context = await this.browser.newContext({
        locale: 'zh-TW',
        timezoneId: 'Asia/Taipei',
      })
      this.page = await this.context.newPage()
      this.page.setDefaultTimeout(options.timeout)

      // 登入
      logger.info(`[${this.bankName}] 前往登入頁面: ${this.loginUrl}`)
      await this.page.goto(this.loginUrl, { waitUntil: 'load' })

      logger.info(`[${this.bankName}] 登入中...`)
      const loginSuccess = await this.login(this.page, credentials)
      if (!loginSuccess) {
        result.error = '登入失敗'
        return result
      }
      logger.info(`[${this.bankName}] 登入成功`)

      // 爬各類資料
      logger.info(`[${this.bankName}] 爬取台幣存款...`)
      result.deposits = await this.scrapeDeposits(this.page)
      logger.info(`[${this.bankName}] 取得 ${result.deposits.length} 筆台幣存款`)

      logger.info(`[${this.bankName}] 爬取外幣存款...`)
      result.foreignDeposits = await this.scrapeForeignDeposits(this.page)
      logger.info(`[${this.bankName}] 取得 ${result.foreignDeposits.length} 筆外幣存款`)

      logger.info(`[${this.bankName}] 爬取信用卡...`)
      result.creditCards = await this.scrapeCreditCards(this.page)
      logger.info(`[${this.bankName}] 取得 ${result.creditCards.length} 筆信用卡`)

      logger.info(`[${this.bankName}] 爬取貸款...`)
      result.loans = await this.scrapeLoans(this.page)
      logger.info(`[${this.bankName}] 取得 ${result.loans.length} 筆貸款`)

      result.success = true
      logger.info(`[${this.bankName}] 爬取完成!`)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      result.error = message
      logger.error(`[${this.bankName}] 爬取失敗: ${message}`)
    } finally {
      await this.cleanup()
    }

    return result
  }

  private async cleanup(): Promise<void> {
    try {
      if (this.context) await this.context.close()
      if (this.browser) await this.browser.close()
    } catch {
      // ignore cleanup errors
    }
    this.page = null
    this.context = null
    this.browser = null
  }
}
