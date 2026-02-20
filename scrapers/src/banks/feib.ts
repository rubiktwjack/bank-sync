import type { Page } from 'playwright'
import { BaseScraper } from '../base-scraper.js'
import type { BankCredentials, ScrapedDeposit, ScrapedForeignDeposit, ScrapedCreditCard } from '../types.js'
import { logger } from '../utils/logger.js'

/**
 * 遠東國際商業銀行爬蟲
 * 網銀網址：https://www.feib.com.tw/
 *
 * 頁面結構：
 * - 登入在 iframe IBIframe1 (ebank.feib.com.tw/netbank mainIndex5.jsp)
 * - 新版登入頁無驗證碼，三欄位：身分證 + 使用者代號 + 密碼
 * - 登入後 page.goto 到 ebank 子頁面（cookie 共用）
 * - 存款查詢：select 選帳號 → 查詢 → key-value table
 * - 信用卡：帳單明細查詢（select 月份 → 查詢）
 */
export class FeibScraper extends BaseScraper {
  readonly bankId = 'feib'
  readonly bankName = '遠東銀行'
  readonly loginUrl = 'https://www.feib.com.tw/'

  async login(page: Page, credentials: BankCredentials): Promise<boolean> {
    const custid = credentials.extra?.custid || ''
    if (!custid) {
      logger.error('[遠東銀行] 缺少身分證字號 (extra.custid)')
      return false
    }

    await page.waitForTimeout(5000)

    const frame = page.frames().find(f => f.url().includes('ebank.feib.com.tw'))
    if (!frame) {
      logger.error('[遠東銀行] 找不到登入 iframe')
      return false
    }

    // 填入欄位（用 evaluate string 避免 tsx __name 注入問題）
    await frame.evaluate(
      `(function(c, u, p) {
        function s(id, v) { var e = document.getElementById(id); if(e) { e.value = v; e.dispatchEvent(new Event('input', {bubbles:true})); } }
        s('CUSTID', c); s('USERID', u); s('psd1', p);
      })(${JSON.stringify(custid)}, ${JSON.stringify(credentials.username)}, ${JSON.stringify(credentials.password)})`
    )

    await frame.evaluate(`document.getElementById('submitbtn').click()`)
    await page.waitForTimeout(8000)

    // 檢查是否跳到重複登入頁
    let postFrame = page.frames().find(f => f.url().includes('ebank.feib.com.tw'))
    const postUrl = postFrame?.url() || ''

    if (postUrl.toLowerCase().includes('doublelogin')) {
      logger.info('[遠東銀行] 偵測到重複登入，提交 forceLogin...')
      // doubleLogin 頁面的 form name="doubleLogin"，submit 後執行 forceLogin
      await postFrame!.evaluate(`(function() {
        if (typeof submitForm === 'function') { submitForm(); return; }
        var f = document.forms['doubleLogin'] || document.querySelector('form');
        if (f) f.submit();
      })()`)
      await page.waitForTimeout(8000)
      postFrame = page.frames().find(f => f.url().includes('ebank.feib.com.tw'))
    }

    // 重新取得最終 frame 狀態
    postFrame = page.frames().find(f => f.url().includes('ebank.feib.com.tw'))
    const finalUrl = postFrame?.url() || ''
    if (finalUrl.includes('welcome') || finalUrl.includes('TrxDispatcher')) {
      logger.info('[遠東銀行] 登入成功')
      return true
    }

    logger.error(`[遠東銀行] 登入失敗: ${finalUrl}`)
    return false
  }

  async scrapeDeposits(page: Page): Promise<ScrapedDeposit[]> {
    const deposits: ScrapedDeposit[] = []

    try {
      // 登入時已導航到存款頁，如果不是則重新導航
      if (!page.url().includes('SavAcctBalInq')) {
        await page.goto(
          'https://ebank.feib.com.tw/netbank/servlet/TrxDispatcher?trx=com.lb.wibc.trx.SavAcctBalInq&state=prompt&menu_id=2-2-1',
          { waitUntil: 'load' }
        )
        await page.waitForTimeout(3000)
      }

      const accounts: Array<{value: string, text: string}> = await page.evaluate(
        `(function() {
          var sel = document.getElementById('acctno');
          if (!sel) return [];
          return Array.from(sel.options)
            .filter(function(o) { return o.value !== 'undefined'; })
            .map(function(o) { return { value: o.value, text: o.text.trim() }; });
        })()`
      )

      const twdAccounts = accounts.filter(a => a.text.includes('活期儲蓄存款') || a.text.includes('活期存款'))
      logger.info(`[遠東銀行] 找到 ${twdAccounts.length} 個台幣帳號`)

      for (const acct of twdAccounts) {
        await page.evaluate(`(function() {
          var sel = document.getElementById('acctno');
          sel.value = ${JSON.stringify(acct.value)};
          sel.dispatchEvent(new Event('change', {bubbles:true}));
        })()`)
        await page.waitForTimeout(1000)

        await page.evaluate(`(function() {
          var links = document.querySelectorAll('a');
          for (var i = 0; i < links.length; i++) {
            if (links[i].textContent.trim() === '查詢') { links[i].click(); break; }
          }
        })()`)
        await page.waitForTimeout(3000)

        const balance = await this.parseBalance(page)
        if (balance !== null) {
          deposits.push({
            accountNumber: acct.value,
            balance,
            currency: 'TWD',
            accountType: 'savings',
            nickname: acct.text.split('/')[0],
          })
        }
      }
    } catch (error) {
      logger.error(`[遠東銀行] 爬取台幣存款失敗: ${error}`)
    }

    return deposits
  }

  async scrapeForeignDeposits(page: Page): Promise<ScrapedForeignDeposit[]> {
    const deposits: ScrapedForeignDeposit[] = []

    try {
      await page.goto(
        'https://ebank.feib.com.tw/netbank/servlet/TrxDispatcher?trx=com.lb.wibc.trx.SavAcctBalInq&state=prompt&menu_id=2-2-1',
        { waitUntil: 'load' }
      )
      await page.waitForTimeout(3000)

      const accounts: Array<{value: string, text: string}> = await page.evaluate(
        `(function() {
          var sel = document.getElementById('acctno');
          if (!sel) return [];
          return Array.from(sel.options)
            .filter(function(o) { return o.value !== 'undefined'; })
            .map(function(o) { return { value: o.value, text: o.text.trim() }; });
        })()`
      )

      const fxAccounts = accounts.filter(a => a.text.includes('外匯活期存款'))
      logger.info(`[遠東銀行] 找到 ${fxAccounts.length} 個外幣帳號`)

      for (const acct of fxAccounts) {
        await page.evaluate(`(function() {
          var sel = document.getElementById('acctno');
          sel.value = ${JSON.stringify(acct.value)};
          sel.dispatchEvent(new Event('change', {bubbles:true}));
        })()`)
        await page.waitForTimeout(2000)

        const currencies: Array<{value: string, text: string}> = await page.evaluate(
          `(function() {
            var sel = document.getElementById('ccycd');
            if (!sel) return [];
            return Array.from(sel.options)
              .filter(function(o) { return o.value !== ''; })
              .map(function(o) { return { value: o.value, text: o.text.trim() }; });
          })()`
        )

        for (const ccy of currencies) {
          await page.evaluate(`(function() {
            var sel = document.getElementById('ccycd');
            sel.value = ${JSON.stringify(ccy.value)};
            sel.dispatchEvent(new Event('change', {bubbles:true}));
          })()`)

          await page.evaluate(`(function() {
            var links = document.querySelectorAll('a');
            for (var i = 0; i < links.length; i++) {
              if (links[i].textContent.trim() === '查詢') { links[i].click(); break; }
            }
          })()`)
          await page.waitForTimeout(3000)

          const balance = await this.parseBalance(page)
          if (balance !== null) {
            deposits.push({
              accountNumber: acct.value,
              balance,
              currency: this.mapCurrencyCode(ccy.text),
              nickname: `${acct.text.split('/')[0]} ${ccy.text}`,
            })
          }
        }
      }
    } catch (error) {
      logger.error(`[遠東銀行] 爬取外幣存款失敗: ${error}`)
    }

    return deposits
  }

  async scrapeCreditCards(page: Page): Promise<ScrapedCreditCard[]> {
    try {
      await page.goto(
        'https://ebank.feib.com.tw/netbank/servlet/TrxDispatcher?trx=com.lb.wibc.trx.CCMember&state=eStatementQry&menu_id=5-1-1',
        { waitUntil: 'load' }
      )
      await page.waitForTimeout(3000)

      const hasOptions = await page.evaluate(
        `(function() {
          var sel = document.getElementById('yyyyMm');
          return sel ? sel.options.length > 0 : false;
        })()`
      )

      if (!hasOptions) {
        logger.info('[遠東銀行] 無信用卡帳單資料')
        return []
      }

      logger.info('[遠東銀行] 信用卡帳單解析尚未實作')
      return []
    } catch (error) {
      logger.error(`[遠東銀行] 爬取信用卡失敗: ${error}`)
      return []
    }
  }

  /** 解析帳戶餘額：NTD$123,456.78元 → 123456.78 */
  private async parseBalance(page: Page): Promise<number | null> {
    try {
      const balanceText: string = await page.evaluate(
        `(function() {
          var tables = document.querySelectorAll('table:not(.red-arrow)');
          for (var t = 0; t < tables.length; t++) {
            for (var r = 0; r < tables[t].rows.length; r++) {
              var row = tables[t].rows[r];
              if (row.cells.length >= 2 && row.cells[0].textContent.trim() === '帳戶餘額') {
                return row.cells[1].textContent.trim();
              }
            }
          }
          return '';
        })()`
      )

      if (!balanceText) return null

      const match = balanceText.match(/\$([0-9,.]+)/)
      if (match) {
        return parseFloat(match[1].replace(/,/g, ''))
      }

      return null
    } catch {
      return null
    }
  }

  /** 中文幣別名 → ISO 幣別代碼 */
  private mapCurrencyCode(name: string): string {
    const map: Record<string, string> = {
      '美元': 'USD', '日圓': 'JPY', '歐元': 'EUR',
      '英鎊': 'GBP', '澳幣': 'AUD', '加幣': 'CAD',
      '瑞士法郎': 'CHF', '港幣': 'HKD', '新加坡幣': 'SGD',
      '南非幣': 'ZAR', '瑞典克朗': 'SEK', '紐幣': 'NZD',
      '人民幣': 'CNY', '泰銖': 'THB',
    }
    return map[name] || name
  }
}
