import type { Page } from 'playwright'
import { BaseScraper } from '../base-scraper.js'
import type { BankCredentials, ScrapedDeposit, ScrapedForeignDeposit, ScrapedCreditCard } from '../types.js'

/**
 * 永豐銀行爬蟲
 * 網銀網址：https://mma.sinopac.com/
 *
 * TODO: 實際實作
 */
export class SinopacScraper extends BaseScraper {
  readonly bankId = 'sinopac'
  readonly bankName = '永豐銀行'
  readonly loginUrl = 'https://mma.sinopac.com/'

  async login(page: Page, credentials: BankCredentials): Promise<boolean> {
    throw new Error('永豐銀行爬蟲尚未實作')
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
