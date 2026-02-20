import type { Page } from 'playwright'
import { BaseScraper } from '../base-scraper.js'
import type { BankCredentials, ScrapedDeposit, ScrapedForeignDeposit, ScrapedCreditCard } from '../types.js'
import { logger } from '../utils/logger.js'

// ─── 選擇器集中管理 ───
// 2026-02-20 透過 Chrome DevTools CDP 從真實頁面擷取驗證
// 中信為 Angular SPA，無 iframe，用 formcontrolname 定位 input
const SELECTORS = {
  login: {
    custidInput: 'input[formcontrolname="custIxd"]',   // 身分證字號 (text, maxlength=11)
    useridInput: 'input[formcontrolname="userIxd"]',   // 使用者代號 (password, maxlength=12)
    passwordInput: 'input[formcontrolname="pxd"]',     // 網銀密碼 (password, maxlength=12)
    submitButton: 'a.btn_submit.mb10[tabindex="5"]',      // 登入按鈕（排除其他 btn_submit）
  },

  // 登入後首頁（我的總覽）
  overview: {
    totalAmount: '.totalAmount .txt_lg',                // 總淨值金額
    twdTab: '.nav-tabs .nav-item:first-child a',        // 資產總額 tab
    twdCard: '.card-header:has-text("臺幣存款")',
    fxCard: '.card-header:has-text("外幣存款")',
  },

  // 台幣存款概要頁
  deposits: {
    totalBalance: '.card_title .txt_money',             // 臺幣帳戶餘額
    accountList: '.list-group-item',                    // 各帳戶
    accountNumber: '.td.hd span',                       // 帳號
    accountBalance: '.td.rt.txt_money',                 // 餘額
  },

  // 外幣存款概要頁
  foreignDeposits: {
    accountItem: '.list-group-item',
    currencyFlag: 'i.flag',                             // <i class="flag usd">
  },

  // 信用卡帳單資訊
  creditCards: {
    errorMessage: ':has-text("暫無法使用本服務")',
  },
}

/**
 * 中國信託銀行爬蟲
 *
 * 登入方式：身分證字號 + 使用者代號 + 網銀密碼（三欄位）
 * Angular SPA，無 iframe，側邊欄點擊導覽
 * 參考：https://www.ctbcbank.com/newweb/
 *
 * 環境變數：
 *   BANK_CTBC_ENABLED=true
 *   BANK_CTBC_EXTRA_CUSTID=<身分證字號>
 *   BANK_CTBC_USERNAME=<使用者代號>
 *   BANK_CTBC_PASSWORD=<網銀密碼>
 */
export class CtbcScraper extends BaseScraper {
  readonly bankId = 'ctbc'
  readonly bankName = '中國信託'
  readonly loginUrl = 'https://www.ctbcbank.com/newweb/'
  readonly useCDP = true

  async login(page: Page, credentials: BankCredentials): Promise<boolean> {
    // 等待 Angular 載入完成
    await page.waitForTimeout(5000)

    // 檢查是否已經登入（頁面有 "Hi," 開頭的歡迎文字）
    const bodyText = await page.locator('body').innerText().catch(() => '')
    const isLoggedIn = bodyText.includes('Hi,') && bodyText.includes('我的總覽')
    if (isLoggedIn) {
      logger.info('[中國信託] 已處於登入狀態，導覽到總覽頁')
      await this.navigateTo(page, '我的總覽')
      return true
    }

    // 檢查是否在登入頁
    const hasLoginForm = await page.locator(SELECTORS.login.custidInput).isVisible().catch(() => false)
    if (!hasLoginForm) {
      logger.error('[中國信託] 無法載入登入頁面')
      return false
    }

    const custid = credentials.extra?.custid
    if (!custid) {
      logger.error('[中國信託] 缺少身分證字號 (BANK_CTBC_EXTRA_CUSTID)')
      return false
    }

    // 填入三個欄位
    await page.locator(SELECTORS.login.custidInput).fill(custid)
    await page.locator(SELECTORS.login.useridInput).fill(credentials.username)
    await page.locator(SELECTORS.login.passwordInput).fill(credentials.password)

    // 點擊登入
    await page.locator(SELECTORS.login.submitButton).click()
    logger.info('[中國信託] 已點擊登入，等待回應...')

    // 等待總覽頁面出現（登入成功指標）
    try {
      await page.locator(SELECTORS.overview.totalAmount).waitFor({ timeout: 30000 })
      logger.info('[中國信託] 登入成功，總覽頁已載入')
      return true
    } catch {
      logger.error('[中國信託] 登入後無法載入總覽頁')
      return false
    }
  }

  /**
   * 導覽到側邊欄頁面（Angular SPA 需用 click 而非 URL）
   */
  private async navigateTo(page: Page, linkText: string): Promise<boolean> {
    try {
      // Angular SPA 側邊欄：用 evaluate 點擊，因為 Playwright locator 可能找不到隱藏的選單項
      const clicked = await page.evaluate((text) => {
        const links = [...document.querySelectorAll('a')]
        const link = links.find(a => a.textContent?.trim() === text)
        if (link) { link.click(); return true }
        return false
      }, linkText)

      if (!clicked) {
        logger.warn(`[中國信託] 找不到「${linkText}」連結`)
        return false
      }

      // Angular 路由切換後等待內容載入
      await page.waitForTimeout(3000)
      return true
    } catch (error) {
      logger.warn(`[中國信託] 無法導覽到「${linkText}」: ${error}`)
      return false
    }
  }

  /**
   * 爬取台幣存款
   *
   * 導覽到「臺幣存款概要」頁
   * 結構：.list-group-item 內有帳號 span + 餘額 .txt_money
   * 例：082540684331  10,554
   */
  async scrapeDeposits(page: Page): Promise<ScrapedDeposit[]> {
    const deposits: ScrapedDeposit[] = []

    try {
      if (!await this.navigateTo(page, '臺幣存款概要')) return deposits

      const items = page.locator('.list-group-item').filter({
        hasNot: page.locator('.group-title'),
      })
      const count = await items.count()

      for (let i = 0; i < count; i++) {
        const item = items.nth(i)
        const text = (await item.textContent() ?? '').trim()

        // 格式：帳號  金額
        const match = text.match(/(\d{10,16})\s+([\d,]+)/)
        if (!match) continue

        deposits.push({
          accountNumber: match[1],
          balance: this.parseAmount(match[2]),
          currency: 'TWD',
          accountType: 'checking',
        })
      }
    } catch (error) {
      logger.warn(`[中國信託] 台幣存款爬取失敗: ${error}`)
    }

    return deposits
  }

  /**
   * 爬取外幣存款
   *
   * 導覽到「外幣存款概要」頁
   * 結構：
   *   li.list-group-item (group-title): "以下為原幣餘額"
   *   li.list-group-item: "帳號：082131149463"
   *   li.list-group-item: <i class="flag usd">美元  0.00
   */
  async scrapeForeignDeposits(page: Page): Promise<ScrapedForeignDeposit[]> {
    const foreignDeposits: ScrapedForeignDeposit[] = []

    try {
      if (!await this.navigateTo(page, '外幣存款概要')) return foreignDeposits

      const items = page.locator('.list-group-item')
      const count = await items.count()

      let currentAccountNumber = ''

      for (let i = 0; i < count; i++) {
        const item = items.nth(i)
        const text = (await item.textContent() ?? '').replace(/\s+/g, ' ').trim()

        // 帳號行：帳號：082131149463
        const acctMatch = text.match(/帳號[：:](\d{10,16})/)
        if (acctMatch) {
          currentAccountNumber = acctMatch[1]
          continue
        }

        // 幣別行：有 flag icon + 幣別名 + 金額
        const hasFlag = await item.locator('i.flag').count() > 0
        if (hasFlag && currentAccountNumber) {
          // 取得幣別 class (e.g. "flag usd" → "usd")
          const flagClass = await item.locator('i.flag').getAttribute('class') ?? ''
          const currencyCode = this.flagToCurrency(flagClass)

          // 取得金額
          const amountMatch = text.match(/([\d,]+\.?\d*)/)
          if (amountMatch && currencyCode) {
            const balance = this.parseAmount(amountMatch[1])
            if (balance > 0) {
              foreignDeposits.push({
                accountNumber: currentAccountNumber,
                balance,
                currency: currencyCode,
              })
            }
          }
        }
      }
    } catch (error) {
      logger.warn(`[中國信託] 外幣存款爬取失敗: ${error}`)
    }

    return foreignDeposits
  }

  /**
   * 爬取信用卡帳單
   *
   * 導覽到「帳單資訊」頁
   * 若無信用卡會顯示錯誤訊息，直接回傳空陣列
   */
  async scrapeCreditCards(page: Page): Promise<ScrapedCreditCard[]> {
    const cards: ScrapedCreditCard[] = []

    try {
      if (!await this.navigateTo(page, '帳單資訊')) return cards

      // 等待頁面載入
      await page.waitForTimeout(2000)

      // 檢查是否有「暫無法使用本服務」的錯誤
      const bodyText = await page.locator('body').textContent() ?? ''
      if (bodyText.includes('暫無法使用本服務') || bodyText.includes('尚未持有')) {
        logger.info('[中國信託] 無信用卡')
        return cards
      }

      // 有信用卡的情況：解析帳單資訊
      // 取得本期應繳金額
      const amountEls = page.locator('.txt_money')
      const amountCount = await amountEls.count()

      // 嘗試從帳單頁面抓取應繳金額和繳款截止日
      let currentBalance = 0
      let dueDate: string | undefined

      for (let i = 0; i < amountCount; i++) {
        const parent = amountEls.nth(i).locator('..')
        const parentText = (await parent.textContent() ?? '').trim()

        if (parentText.includes('本期應繳') || parentText.includes('應繳金額')) {
          const amountText = (await amountEls.nth(i).textContent() ?? '').trim()
          currentBalance = this.parseAmount(amountText)
        }
        if (parentText.includes('繳款截止')) {
          const dateText = (await amountEls.nth(i).textContent() ?? '').trim()
          dueDate = this.parseDate(dateText)
        }
      }

      if (currentBalance > 0) {
        cards.push({
          cardNumber: '中信信用卡',
          cardName: '中信信用卡',
          currentBalance,
          minimumPayment: 0,
          creditLimit: 0,
          dueDate,
        })
      }
    } catch (error) {
      logger.warn(`[中國信託] 信用卡爬取失敗: ${error}`)
    }

    return cards
  }

  // ─── 工具方法 ───

  private parseAmount(text: string): number {
    const cleaned = text.replace(/[NT$＄¥€£￥TWD]/g, '').replace(/,/g, '').replace(/\s/g, '').trim()
    const num = parseFloat(cleaned)
    return isNaN(num) ? 0 : num
  }

  private parseDate(text: string): string | undefined {
    const cleaned = text.trim()
    // 西元年 2026/02/25 or 2026-02-25
    const westMatch = cleaned.match(/(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})/)
    if (westMatch) {
      return `${westMatch[1]}-${westMatch[2].padStart(2, '0')}-${westMatch[3].padStart(2, '0')}`
    }
    // 民國年 115/02/25
    const rocMatch = cleaned.match(/(\d{2,3})[/\-.](\d{1,2})[/\-.](\d{1,2})/)
    if (rocMatch) {
      const year = parseInt(rocMatch[1], 10)
      if (year < 200) {
        return `${year + 1911}-${rocMatch[2].padStart(2, '0')}-${rocMatch[3].padStart(2, '0')}`
      }
    }
    return undefined
  }

  /**
   * 將 flag CSS class 轉換為貨幣代碼
   * e.g. "flag usd" → "USD"
   */
  private flagToCurrency(flagClass: string): string | null {
    const match = flagClass.match(/flag\s+(\w+)/)
    if (!match) return null
    return match[1].toUpperCase()
  }
}
