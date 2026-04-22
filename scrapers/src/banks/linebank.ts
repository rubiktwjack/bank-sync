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
      await page.waitForTimeout(2000)

      const accountNumber = await this.selectAccountAndQuery(page)
      if (!accountNumber) {
        logger.warn('[LINE Bank] 找不到帳戶 dropdown 或無可選帳戶')
        return deposits
      }

      const balance = await this.extractBalance(page)
      deposits.push({
        accountNumber,
        balance,
        currency: 'TWD',
        accountType: 'savings',
      })
      logger.info(`[LINE Bank] 主帳戶 ${accountNumber}, 餘額 ${balance}`)
    } catch (error) {
      logger.error(`[LINE Bank] 爬取存款失敗: ${error}`)
    }

    return deposits
  }

  /** 選帳戶 dropdown、點查詢，回傳帳號（去除 dash） */
  private async selectAccountAndQuery(page: Page): Promise<string> {
    const acctOptions = await page.evaluate(`(function() {
      var sel = document.getElementById('account-dropdown');
      if (!sel) return [];
      return Array.from(sel.options).map(function(o){
        return { value: o.value, text: (o.textContent||'').trim() };
      });
    })()`) as { value: string; text: string }[]

    const firstReal = acctOptions.find(o => o.value && o.value.trim().length > 0)
    if (!firstReal) return ''

    await page.selectOption('#account-dropdown', firstReal.value)
    await page.waitForTimeout(500)

    await page.evaluate(`(function() {
      var btns = Array.from(document.querySelectorAll('button, input[type="submit"], [role="button"]'));
      for (var i = 0; i < btns.length; i++) {
        var t = (btns[i].textContent || btns[i].getAttribute('aria-label') || btns[i].value || '').trim();
        if (/^查詢$/.test(t)) { btns[i].click(); return; }
      }
    })()`)
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {})
    await page.waitForTimeout(2000)

    return firstReal.value.replace(/-/g, '')
  }

  /** 從查詢結果頁解析「可用餘額 : NT$xxx」 */
  private async extractBalance(page: Page): Promise<number> {
    await page.waitForFunction(
      `document.body && /可用餘額|結餘|NT\\$\\s*\\d/.test(document.body.innerText)`,
      { timeout: 10000 },
    ).catch(() => {})

    const result = await page.evaluate(`(function() {
      var bodyText = document.body ? document.body.innerText : '';
      var balKeywords = ['可用餘額', '帳戶餘額', '帳戶結餘', '存款餘額', '結餘', '餘額'];
      var balLine = '';
      for (var k = 0; k < balKeywords.length && !balLine; k++) {
        var m = bodyText.match(new RegExp(balKeywords[k] + '[^\\n]*'));
        if (m) balLine = m[0];
      }
      var nt = bodyText.match(/NT\\$\\s*[\\d,]+/g) || [];
      return { balLine: balLine, ntAmounts: nt.slice(0, 5), snippet: bodyText.slice(0, 600) };
    })()`) as { balLine: string; ntAmounts: string[]; snippet: string }

    const balMatch = result.balLine.match(/NT\$[\s]*([\d,]+)/) ?? result.balLine.match(/([\d,]+)/)
    if (balMatch) return parseFloat(balMatch[1].replace(/,/g, ''))

    if (result.ntAmounts.length > 0) {
      const first = result.ntAmounts[0].match(/([\d,]+)/)
      if (first) return parseFloat(first[1].replace(/,/g, ''))
    }

    logger.warn(`[LINE Bank] 餘額解析失敗，NT$ 候選: [${result.ntAmounts.join(', ')}], body: "${result.snippet}"`)
    return 0
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
