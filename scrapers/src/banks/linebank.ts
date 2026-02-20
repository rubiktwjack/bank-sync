import type { Page } from 'playwright'
import { BaseScraper } from '../base-scraper.js'
import type { BankCredentials, ScrapedDeposit, ScrapedForeignDeposit, ScrapedCreditCard } from '../types.js'

/**
 * LINE Bank 爬蟲
 * 網銀網址：https://www.linebank.com.tw/
 *
 * TODO: 實際實作（LINE Bank 可能僅有 App，需確認是否有網銀）
 */
export class LinebankScraper extends BaseScraper {
  readonly bankId = 'linebank'
  readonly bankName = 'LINE Bank'
  readonly loginUrl = 'https://www.linebank.com.tw/'

  async login(page: Page, credentials: BankCredentials): Promise<boolean> {
    throw new Error('LINE Bank 爬蟲尚未實作')
  }

  async scrapeDeposits(page: Page): Promise<ScrapedDeposit[]> {
    return []
  }

  async scrapeForeignDeposits(page: Page): Promise<ScrapedForeignDeposit[]> {
    return []
  }

  async scrapeCreditCards(page: Page): Promise<ScrapedCreditCard[]> {
    return []
  }
}
