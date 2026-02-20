import type { Page } from 'playwright'
import { BaseScraper } from '../base-scraper.js'
import type { BankCredentials, ScrapedDeposit, ScrapedForeignDeposit, ScrapedCreditCard } from '../types.js'

/**
 * 遠東國際商業銀行爬蟲
 * 網銀網址：https://ebank.feib.com.tw/
 *
 * TODO: 實際實作
 */
export class FeibScraper extends BaseScraper {
  readonly bankId = 'feib'
  readonly bankName = '遠東銀行'
  readonly loginUrl = 'https://ebank.feib.com.tw/'

  async login(page: Page, credentials: BankCredentials): Promise<boolean> {
    throw new Error('遠東銀行爬蟲尚未實作')
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
