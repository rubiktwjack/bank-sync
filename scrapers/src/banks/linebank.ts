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
      // 等到有任何含「主帳戶」字樣或 10+ 位連續數字的文字出現為止
      await page.waitForFunction(
        `document.body && /主帳戶|可用餘額|\\d{10,}/.test(document.body.innerText)`,
        { timeout: 15000 },
      ).catch(() => {})
      await page.waitForTimeout(2000)

      const data = await page.evaluate(`(function() {
        var headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, [role="heading"]'));
        var headingTexts = headings.map(function(el){ return (el.textContent||'').trim(); }).filter(Boolean);
        // 優先挑含「主帳戶」或 10+ 位數字的標題
        var acctLine = headingTexts.find(function(t){ return /主帳戶|\\(\\d{10,}\\)/.test(t); }) || '';
        // fallback：從整頁抓「主帳戶 (xxxx)」
        var bodyText = document.body ? document.body.innerText : '';
        if (!acctLine) {
          var m = bodyText.match(/主帳戶[^\\n]*?\\(\\s*(\\d{8,})\\s*\\)/);
          if (m) acctLine = m[0];
        }
        // fallback 2：整頁找連續 10+ 位數字
        if (!acctLine) {
          var m2 = bodyText.match(/\\b(\\d{10,15})\\b/);
          if (m2) acctLine = m2[0];
        }
        var balLine = '';
        var allText = Array.from(document.querySelectorAll('p, span, div, li'))
          .map(function(el){ return (el.textContent||'').trim(); })
          .filter(function(t){ return t.includes('可用餘額') && t.length < 200; });
        if (allText.length > 0) balLine = allText[0];
        if (!balLine) {
          var mb = bodyText.match(/可用餘額[^\\n]*/);
          if (mb) balLine = mb[0];
        }
        return {
          acctLine: acctLine,
          balLine: balLine,
          headingSample: headingTexts.slice(0, 5).join(' | '),
          bodySnippet: bodyText.slice(0, 400),
        };
      })()`) as { acctLine: string; balLine: string; headingSample: string; bodySnippet: string }

      const acctMatch = data.acctLine.match(/\((\d+)\)/) ?? data.acctLine.match(/(\d{8,15})/)
      const accountNumber = acctMatch ? acctMatch[1] : ''

      const balMatch = data.balLine.match(/NT\$[\s]*([\d,]+)/) ?? data.balLine.match(/([\d,]+)/)
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
        logger.warn(`[LINE Bank] 無法解析帳號，headings: "${data.headingSample}" body: "${data.bodySnippet.slice(0, 200)}"`)
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
