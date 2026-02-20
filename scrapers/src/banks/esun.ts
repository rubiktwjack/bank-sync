import type { Page, FrameLocator } from 'playwright'
import { BaseScraper } from '../base-scraper.js'
import type { BankCredentials, ScrapedDeposit, ScrapedForeignDeposit, ScrapedCreditCard } from '../types.js'
import { logger } from '../utils/logger.js'

// ─── 選擇器集中管理 ───
// 2026-02-20 透過 Chrome DevTools CDP 從真實頁面擷取驗證
const SELECTORS = {
  // 所有內容都在此 iframe 內
  iframe: 'iframe[name="iframe1"]',

  // 登入頁
  login: {
    custidInput: '#loginform\\:custid',        // 身分證字號或統一編號
    usernameInput: '#loginform\\:name',        // 使用者名稱 (type=password)
    passwordInput: '#loginform\\:pxsswd',      // 使用者密碼 (注意是 pxsswd)
    submitButton: '#loginform\\:linkCommand',  // 登入按鈕 (a.login_btn)
    errorMessage: '#loginform\\:onError',      // 登入錯誤訊息
    // 重複登入 popup：jQuery UI Dialog，按「確定登入」繼續
    duplicateLoginDialog: '.ui-dialog',
    duplicateLoginConfirm: '.ui-dialog-buttonset button:first-child', // "確定登入"
  },

  // 登入後首頁：台幣存款表格
  // table#fms01002:grid_DataGridBody — 欄位：帳號類別 | 帳號 | 帳戶餘額 | 功能
  deposits: {
    table: '#fms01002\\:grid_DataGridBody',
  },

  // 登入後首頁：外幣存款表格
  // table#fms01003:grid_DataGridBody — 第一行有帳號，後續行是各幣別餘額
  foreignDeposits: {
    table: '#fms01003\\:grid_DataGridBody',
  },

  // 信用卡帳單頁（需從選單導航）
  // table.table_hor — 總覽：信用額度、繳款截止日等
  // table#fcm01003:grid_DataGridBody — 帳單列表：帳單月份 | 幣別 | 應繳總金額 | 實繳金額 | 功能
  creditCards: {
    // 選單：hover li05 (信用卡) → 點「信用卡帳單資訊」
    menuParent: 'li.main_nav_ul_li05',
    menuBillInfo: 'a:has-text("信用卡帳單資訊")',
    summaryTable: 'table.table_hor',
    billTable: '#fcm01003\\:grid_DataGridBody',
  },

  // 登出
  logout: 'a.log_out',
}

// 台幣帳戶類型對應
const ACCOUNT_TYPE_MAP: Record<string, 'checking' | 'savings' | 'fixed'> = {
  '活期存款': 'checking',
  '活期儲蓄': 'savings',
  '活儲': 'savings',
  '綜存': 'savings',
  '行員活儲': 'savings',
  '定期存款': 'fixed',
  '定存': 'fixed',
}

/**
 * 玉山銀行爬蟲
 *
 * 登入方式：身分證字號 + 使用者名稱 + 密碼（三欄位）
 * 登入表單及所有內容都在 iframe[name="iframe1"] 內
 * 參考：https://ebank.esunbank.com.tw/
 *
 * 注意事項：
 * - 使用者名稱錯 5 次會鎖帳號（隔日開放）
 * - 密碼錯 5 次會停用，需重新申請
 * - 前次未登出再登入會跳重複登入 popup，需按確認
 *
 * 環境變數：
 *   BANK_ESUN_ENABLED=true
 *   BANK_ESUN_EXTRA_CUSTID=<身分證字號>
 *   BANK_ESUN_USERNAME=<使用者名稱>
 *   BANK_ESUN_PASSWORD=<密碼>
 */
export class EsunScraper extends BaseScraper {
  readonly bankId = 'esun'
  readonly bankName = '玉山銀行'
  readonly loginUrl = 'https://ebank.esunbank.com.tw/'

  private getFrame(page: Page): FrameLocator {
    return page.frameLocator(SELECTORS.iframe)
  }

  async login(page: Page, credentials: BankCredentials): Promise<boolean> {
    await page.waitForLoadState('networkidle')

    const frame = this.getFrame(page)
    logger.info('[玉山銀行] 切換到登入 iframe')

    // 等待身分證欄位出現
    const custidInput = frame.locator(SELECTORS.login.custidInput)
    await custidInput.waitFor({ timeout: 10000 })

    // 檢查身分證字號
    const custid = credentials.extra?.custid
    if (!custid) {
      logger.error('[玉山銀行] 缺少身分證字號 (BANK_ESUN_EXTRA_CUSTID)')
      return false
    }

    // 填入三個欄位
    await custidInput.fill(custid)
    await frame.locator(SELECTORS.login.usernameInput).fill(credentials.username)
    await frame.locator(SELECTORS.login.passwordInput).fill(credentials.password)

    // 點擊登入
    await frame.locator(SELECTORS.login.submitButton).click()
    logger.info('[玉山銀行] 已點擊登入，等待回應...')

    // 等待結果：可能出現 (1) 首頁存款表格 (2) 重複登入 dialog (3) 錯誤訊息
    // 用 Promise.race 同時偵測多種情況
    const depositsTable = frame.locator(SELECTORS.deposits.table)
    const duplicateDialog = frame.locator(SELECTORS.login.duplicateLoginDialog)
    const errorAlert = frame.locator('.ui-dialog:has-text("錯誤"), .ui-dialog:has-text("失敗"), .ui-dialog:has-text("error")')

    try {
      // 等待任一情況出現（最多 30 秒）
      await Promise.race([
        depositsTable.waitFor({ timeout: 30000 }),
        duplicateDialog.waitFor({ timeout: 30000 }),
        errorAlert.waitFor({ timeout: 30000 }),
      ])
    } catch {
      logger.error('[玉山銀行] 登入後無任何回應')
      return false
    }

    // 檢查是否是重複登入 popup
    if (await duplicateDialog.isVisible().catch(() => false)) {
      await this.handleDuplicateLoginPopup(page, frame)
    }

    // 檢查是否有錯誤 dialog
    if (await errorAlert.isVisible().catch(() => false)) {
      const alertText = await errorAlert.textContent().catch(() => '未知錯誤')
      logger.error(`[玉山銀行] 登入失敗: ${alertText}`)
      return false
    }

    // 檢查台幣存款表格是否出現（登入成功的指標）
    try {
      await depositsTable.waitFor({ timeout: 15000 })
      logger.info('[玉山銀行] 登入成功，首頁已載入')
      return true
    } catch {
      logger.error('[玉山銀行] 無法確認登入狀態')
      return false
    }
  }

  /**
   * 處理重複登入 popup
   * jQuery UI Dialog: "重複登入! 若要在此處登入，請按下「確定登入」..."
   * 按鈕：「確定登入」（繼續登入，踢掉前一 session）/ 「取消」
   */
  private async handleDuplicateLoginPopup(page: Page, frame: FrameLocator): Promise<void> {
    try {
      const dialog = frame.locator(SELECTORS.login.duplicateLoginDialog)
      const visible = await dialog.isVisible().catch(() => false)
      if (visible) {
        logger.info('[玉山銀行] 偵測到重複登入提示，點擊「確定登入」...')
        await frame.locator(SELECTORS.login.duplicateLoginConfirm).click()
        // 等待 dialog 消失並載入首頁
        await dialog.waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {})
        await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {})
        logger.info('[玉山銀行] 重複登入已處理')
      }
    } catch {
      // 沒有出現 popup，正常情況
    }
  }

  /**
   * 爬取台幣存款
   *
   * 首頁直接有 table#fms01002:grid_DataGridBody
   * 格式：帳號類別 | 帳號 | 帳戶餘額 | 功能
   * 最後一行是「總計」要跳過
   */
  async scrapeDeposits(page: Page): Promise<ScrapedDeposit[]> {
    const deposits: ScrapedDeposit[] = []
    const frame = this.getFrame(page)

    try {
      const table = frame.locator(SELECTORS.deposits.table)
      await table.waitFor({ timeout: 10000 })

      const rows = table.locator('tr')
      const count = await rows.count()

      // 第 0 行是 header，最後一行是「總計」，都跳過
      for (let i = 1; i < count - 1; i++) {
        const cells = rows.nth(i).locator('td')
        const cellCount = await cells.count()
        if (cellCount < 3) continue

        const accountTypeText = await cells.nth(0).textContent() ?? ''
        const accountText = await cells.nth(1).textContent() ?? ''
        const balanceText = await cells.nth(2).textContent() ?? ''

        // 帳號格式: "0794976001963  數位帳戶" — 取數字部分
        const accountNumber = accountText.trim().split(/\s+/)[0]
        if (!accountNumber || !balanceText.trim()) continue

        deposits.push({
          accountNumber,
          balance: this.parseAmount(balanceText),
          currency: 'TWD',
          accountType: this.mapAccountType(accountTypeText),
        })
      }
    } catch (error) {
      logger.warn(`[玉山銀行] 台幣存款爬取失敗: ${error}`)
    }

    return deposits
  }

  /**
   * 爬取外幣存款
   *
   * 首頁直接有 table#fms01003:grid_DataGridBody
   * 格式比較特殊：
   *   Row 0: header (帳號類別 | 帳號 | 帳戶餘額 | 功能)
   *   Row 1: "外幣活存" | "0794958001776  外幣" | "CNY 0.01" | 功能選單
   *   Row 2: (colspan) "JPY 68,702.00"   ← 同帳號的其他幣別
   *   Row 3: (colspan) "USD 1.05"
   *   Row N: "等值臺幣總計" | ... | "TWD 13,883.00" | ...
   */
  async scrapeForeignDeposits(page: Page): Promise<ScrapedForeignDeposit[]> {
    const foreignDeposits: ScrapedForeignDeposit[] = []
    const frame = this.getFrame(page)

    try {
      const table = frame.locator(SELECTORS.foreignDeposits.table)
      await table.waitFor({ timeout: 10000 })

      const rows = table.locator('tr')
      const count = await rows.count()

      let currentAccountNumber = ''

      // 第 0 行是 header，最後一行是「等值臺幣總計」，都跳過
      for (let i = 1; i < count - 1; i++) {
        const cells = rows.nth(i).locator('td')
        const cellCount = await cells.count()

        if (cellCount >= 3) {
          // 完整行：有帳號類別、帳號、餘額
          const accountText = await cells.nth(1).textContent() ?? ''
          const balanceText = await cells.nth(2).textContent() ?? ''

          currentAccountNumber = accountText.trim().split(/\s+/)[0]
          const parsed = this.parseForeignBalance(balanceText.trim())
          if (parsed && currentAccountNumber) {
            foreignDeposits.push({
              accountNumber: currentAccountNumber,
              balance: parsed.balance,
              currency: parsed.currency,
            })
          }
        } else if (cellCount === 1) {
          // 續行：只有一個 cell，格式 "JPY 68,702.00"
          const text = await cells.nth(0).textContent() ?? ''
          const parsed = this.parseForeignBalance(text.trim())
          if (parsed && currentAccountNumber) {
            foreignDeposits.push({
              accountNumber: currentAccountNumber,
              balance: parsed.balance,
              currency: parsed.currency,
            })
          }
        }
      }
    } catch (error) {
      logger.warn(`[玉山銀行] 外幣存款爬取失敗: ${error}`)
    }

    return foreignDeposits
  }

  /**
   * 爬取信用卡帳單（最新一期）
   *
   * 需先導航到「信用卡帳單 / 明細」頁面
   * 總覽表 table.table_hor：信用額度、繳款截止日
   * 帳單表 table#fcm01003:grid_DataGridBody：帳單月份 | 幣別 | 應繳總金額 | 實繳金額
   * 只取第一筆（最新一期）台幣帳單
   */
  async scrapeCreditCards(page: Page): Promise<ScrapedCreditCard[]> {
    const cards: ScrapedCreditCard[] = []
    const frame = this.getFrame(page)

    try {
      // 導航到信用卡帳單頁：hover 主選單展開子選單，再點「信用卡帳單資訊」
      const menuParent = frame.locator(SELECTORS.creditCards.menuParent).first()
      await menuParent.hover()
      await frame.locator(SELECTORS.creditCards.menuBillInfo).first().waitFor({ timeout: 5000 })
      await frame.locator(SELECTORS.creditCards.menuBillInfo).first().click()
      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {})

      // 讀取總覽表：信用額度、繳款截止日
      const summaryTable = frame.locator(SELECTORS.creditCards.summaryTable).first()
      await summaryTable.waitFor({ timeout: 10000 })

      const summaryRows = summaryTable.locator('tr')
      let creditLimit = 0
      let dueDate: string | undefined

      const summaryCount = await summaryRows.count()
      for (let i = 0; i < summaryCount; i++) {
        const cells = summaryRows.nth(i).locator('td')
        const cellCount = await cells.count()
        for (let j = 0; j < cellCount - 1; j++) {
          const label = (await cells.nth(j).textContent() ?? '').trim()
          const value = (await cells.nth(j + 1).textContent() ?? '').trim()
          if (label.includes('信用額度') && label.includes('臺幣')) {
            creditLimit = this.parseAmount(value)
          }
          if (label.includes('繳款截止日')) {
            dueDate = this.parseDate(value)
          }
        }
      }

      // 讀取帳單表：只取最新一期台幣帳單（第一行資料）
      const billTable = frame.locator(SELECTORS.creditCards.billTable)
      await billTable.waitFor({ timeout: 10000 })

      const billRows = billTable.locator('tr')
      const billCount = await billRows.count()

      // Row 0 是 header，Row 1 是最新一期
      if (billCount >= 2) {
        const cells = billRows.nth(1).locator('td')
        const cellCount = await cells.count()
        if (cellCount >= 4) {
          const billMonth = (await cells.nth(0).textContent() ?? '').trim()   // "0115/01"
          const currencyText = (await cells.nth(1).textContent() ?? '').trim() // "臺幣 TWD"
          const totalAmount = (await cells.nth(2).textContent() ?? '').trim()  // "16,633"
          const paidAmount = (await cells.nth(3).textContent() ?? '').trim()   // "0"

          // 只處理台幣帳單
          if (currencyText.includes('TWD') || currencyText.includes('臺幣')) {
            const currentBalance = this.parseAmount(totalAmount) - this.parseAmount(paidAmount)

            cards.push({
              cardNumber: '',
              cardName: '玉山信用卡',
              currentBalance,
              minimumPayment: 0,
              creditLimit,
              dueDate,
            })
          }
        }
      }
    } catch (error) {
      logger.warn(`[玉山銀行] 信用卡爬取失敗: ${error}`)
    }

    return cards
  }

  // ─── 工具方法 ───

  /**
   * 解析外幣餘額字串，格式: "CNY 0.01" / "JPY 68,702.00" / "USD 1.05"
   */
  private parseForeignBalance(text: string): { currency: string; balance: number } | null {
    const match = text.match(/^([A-Z]{3})\s+([\d,]+\.?\d*)$/)
    if (!match) return null
    return {
      currency: match[1],
      balance: this.parseAmount(match[2]),
    }
  }

  /**
   * 解析金額字串 → 數字
   */
  private parseAmount(text: string): number {
    let cleaned = text
      .replace(/[NT$＄¥€£￥TWD]/g, '')
      .replace(/,/g, '')
      .replace(/\s/g, '')
      .trim()

    if (cleaned.startsWith('(') && cleaned.endsWith(')')) {
      cleaned = '-' + cleaned.slice(1, -1)
    }

    const num = parseFloat(cleaned)
    return isNaN(num) ? 0 : num
  }

  /**
   * 解析日期字串 → ISO date string
   * 處理民國年 (115/02/25) 和西元年 (2026/02/25)
   */
  private parseDate(text: string): string | undefined {
    const cleaned = text.trim()

    // 民國年格式：115/02/25
    const rocMatch = cleaned.match(/^(\d{2,3})[/\-.](\d{1,2})[/\-.](\d{1,2})$/)
    if (rocMatch) {
      const year = parseInt(rocMatch[1], 10)
      if (year < 200) {
        return `${year + 1911}-${rocMatch[2].padStart(2, '0')}-${rocMatch[3].padStart(2, '0')}`
      }
    }

    // 西元年格式：2026/02/25
    const westMatch = cleaned.match(/^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})$/)
    if (westMatch) {
      return `${westMatch[1]}-${westMatch[2].padStart(2, '0')}-${westMatch[3].padStart(2, '0')}`
    }

    return undefined
  }

  /**
   * 將中文帳戶類型對應到標準類型
   */
  private mapAccountType(text: string | null): 'checking' | 'savings' | 'fixed' {
    if (!text) return 'savings'
    const trimmed = text.trim()
    for (const [key, value] of Object.entries(ACCOUNT_TYPE_MAP)) {
      if (trimmed.includes(key)) return value
    }
    return 'savings'
  }
}
