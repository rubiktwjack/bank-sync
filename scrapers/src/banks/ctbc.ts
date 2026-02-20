import type { Page } from 'playwright'
import { BaseScraper } from '../base-scraper.js'
import type { BankCredentials, ScrapedDeposit, ScrapedForeignDeposit, ScrapedCreditCard } from '../types.js'

/**
 * 中國信託銀行爬蟲
 * 網銀網址：https://www.ctbcbank.com/newweb/
 *
 * TODO: 實際實作需要：
 * 1. 研究中信網銀的登入流程
 * 2. 中信有 Home Bank App，網銀版可能有不同介面
 * 3. 處理可能的 SMS OTP 驗證
 */
export class CtbcScraper extends BaseScraper {
  readonly bankId = 'ctbc'
  readonly bankName = '中國信託'
  readonly loginUrl = 'https://www.ctbcbank.com/newweb/'

  async login(page: Page, credentials: BankCredentials): Promise<boolean> {
    // TODO: 實作登入邏輯
    // 中信通常需要：身分證字號 + 使用者代號 + 密碼
    throw new Error('中國信託爬蟲尚未實作，請參考 TODO 完成登入邏輯')
  }

  async scrapeDeposits(page: Page): Promise<ScrapedDeposit[]> {
    // TODO: 實作台幣存款爬取
    return []
  }

  async scrapeForeignDeposits(page: Page): Promise<ScrapedForeignDeposit[]> {
    // TODO: 實作外幣存款爬取
    return []
  }

  async scrapeCreditCards(page: Page): Promise<ScrapedCreditCard[]> {
    // TODO: 實作信用卡爬取
    return []
  }
}
