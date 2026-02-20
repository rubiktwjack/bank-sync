import type { Page } from 'playwright'
import { BaseScraper } from '../base-scraper.js'
import type { BankCredentials, ScrapedDeposit, ScrapedForeignDeposit, ScrapedCreditCard } from '../types.js'
import { logger } from '../utils/logger.js'

/**
 * LINE Bank 爬蟲（使用無障礙版網銀）
 * 登入：https://accessibility.linebank.com.tw/login
 * 帳戶明細：https://accessibility.linebank.com.tw/transaction
 *
 * LINE Bank 為純網銀，僅有一個台幣主帳戶，無外幣、無信用卡。
 */
export class LinebankScraper extends BaseScraper {
  readonly bankId = 'linebank'
  readonly bankName = 'LINE Bank'
  readonly loginUrl = 'https://accessibility.linebank.com.tw/login'

  async login(page: Page, credentials: BankCredentials): Promise<boolean> {
    await page.goto(this.loginUrl, { waitUntil: 'networkidle', timeout: 30000 })
    await page.waitForSelector('#nationalId', { timeout: 10000 })

    // 填入三個欄位
    await page.fill('#nationalId', credentials.extra?.custid ?? '')
    await page.fill('#userId', credentials.username)
    await page.fill('#pw', credentials.password)

    logger.info('[LINE Bank] 已填入帳密，點擊登入')

    // 點擊登入
    await page.click('button[aria-label="登入友善網路銀行"]')

    // 等待導航離開登入頁
    await page.waitForURL('**/!(login)**', { timeout: 20000 }).catch(() => {})
    await page.waitForTimeout(3000)

    const url = page.url()
    if (url.includes('/login')) {
      logger.error('[LINE Bank] 登入失敗，仍在登入頁')
      return false
    }

    // 檢查是否有 modal（重複登入等）
    const modalBtn = await page.$('button[aria-label="確定"]')
    if (modalBtn) {
      const visible = await modalBtn.isVisible()
      if (visible) {
        logger.info('[LINE Bank] 偵測到彈窗，按確定')
        await modalBtn.click()
        await page.waitForTimeout(2000)
      }
    }

    logger.info('[LINE Bank] 登入成功')
    return true
  }

  async scrapeDeposits(page: Page): Promise<ScrapedDeposit[]> {
    const deposits: ScrapedDeposit[] = []

    try {
      await page.goto('https://accessibility.linebank.com.tw/transaction', {
        waitUntil: 'networkidle',
        timeout: 15000,
      })
      await page.waitForTimeout(3000)

      const data = await page.evaluate(() => {
        // h2 contains: "主帳戶 (111011258007)"
        const h2 = document.querySelector('h2')
        const balanceP = document.querySelector('p')

        const h2Text = h2?.textContent?.trim() || ''
        // Extract all p tags to find the balance one
        const allP = Array.from(document.querySelectorAll('p'))
        const balText = allP.find(p => p.textContent?.includes('可用餘額'))?.textContent?.trim() || ''

        return { h2Text, balText }
      })

      // Parse account number from "主帳戶 (111011258007)"
      const acctMatch = data.h2Text.match(/\((\d+)\)/)
      const accountNumber = acctMatch ? acctMatch[1] : ''

      // Parse balance from "可用餘額 : NT$2,853"
      const balMatch = data.balText.match(/NT\$[\s]*([\d,]+)/)
      const balance = balMatch ? parseFloat(balMatch[1].replace(/,/g, '')) : 0

      if (accountNumber) {
        deposits.push({
          accountNumber,
          balance,
          currency: 'TWD',
          accountType: 'savings',
        })
        logger.info(`[LINE Bank] 主帳戶 ${accountNumber}, 餘額 ${balance}`)
      } else {
        logger.warn(`[LINE Bank] 無法解析帳號: ${data.h2Text}`)
      }
    } catch (error) {
      logger.error(`[LINE Bank] 爬取存款失敗: ${error}`)
    }

    return deposits
  }

  async scrapeForeignDeposits(_page: Page): Promise<ScrapedForeignDeposit[]> {
    // LINE Bank 無外幣帳戶
    return []
  }

  async scrapeCreditCards(_page: Page): Promise<ScrapedCreditCard[]> {
    // LINE Bank 無信用卡
    return []
  }
}
