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
      // 先在登入後的當前頁（通常是首頁 / dashboard）抓餘額，因為 /transaction 不含餘額
      const postLoginUrl = page.url()
      logger.info(`[LINE Bank] 登入後 URL: ${postLoginUrl}`)

      // 探查頁面：列出所有 link/button 文字，方便找餘額入口
      const explore = await page.evaluate(`(function() {
        var links = Array.from(document.querySelectorAll('a')).map(function(a){
          return { text: (a.textContent||'').trim().slice(0, 60), href: a.getAttribute('href') || '' };
        }).filter(function(x){ return x.text && x.text.length > 0; });
        var buttons = Array.from(document.querySelectorAll('button, [role="button"]')).map(function(b){
          return ((b.textContent||'').trim() || b.getAttribute('aria-label') || '').slice(0, 60);
        }).filter(Boolean);
        var bodyText = document.body ? document.body.innerText : '';
        var nt = bodyText.match(/NT\\$\\s*[\\d,]+/g) || [];
        var balKeywords = ['可用餘額', '帳戶餘額', '帳戶結餘', '存款餘額', '可動用', '結餘'];
        var balLine = '';
        for (var k = 0; k < balKeywords.length && !balLine; k++) {
          var re = new RegExp(balKeywords[k] + '[^\\n]*');
          var mb = bodyText.match(re);
          if (mb) balLine = mb[0];
        }
        return {
          links: links.slice(0, 20),
          buttons: buttons.slice(0, 15),
          ntAmounts: nt.slice(0, 10),
          balLine: balLine,
          snippet: bodyText.slice(0, 1500),
        };
      })()`) as { links: { text: string; href: string }[]; buttons: string[]; ntAmounts: string[]; balLine: string; snippet: string }
      logger.info(`[LINE Bank] 首頁 links: ${JSON.stringify(explore.links)}`)
      logger.info(`[LINE Bank] 首頁 buttons: [${explore.buttons.join(', ')}]`)
      logger.info(`[LINE Bank] 首頁 NT$: [${explore.ntAmounts.join(', ')}], balLine: "${explore.balLine.slice(0, 80)}"`)
      const preData = explore

      // 取首頁第一個 NT$ 金額作為預設餘額；若之後 /transaction 抓到更具體的會覆蓋
      let prelimBalance = 0
      let prelimSource = 'none'
      const preBalMatch = preData.balLine.match(/NT\$[\s]*([\d,]+)/) ?? preData.balLine.match(/([\d,]+)/)
      if (preBalMatch) {
        prelimBalance = parseFloat(preBalMatch[1].replace(/,/g, ''))
        prelimSource = `balLine="${preData.balLine.slice(0, 80)}"`
      } else if (preData.ntAmounts.length > 0) {
        const first = preData.ntAmounts[0].match(/([\d,]+)/)
        if (first) {
          prelimBalance = parseFloat(first[1].replace(/,/g, ''))
          prelimSource = `homeNT=${preData.ntAmounts[0]}`
        }
      }

      // 若首頁沒帳號資訊，還是去 /transaction 抓帳號
      await page.goto('https://accessibility.linebank.com.tw/transaction', {
        waitUntil: 'networkidle',
        timeout: 15000,
      })
      await page.waitForTimeout(3000)

      // 探查 transaction 頁的 form 結構和查詢按鈕
      const txForm = await page.evaluate(`(function() {
        var inputs = Array.from(document.querySelectorAll('input, select')).map(function(el){
          return {
            tag: el.tagName.toLowerCase(),
            type: el.getAttribute('type') || '',
            name: el.getAttribute('name') || '',
            id: el.id || '',
            placeholder: el.getAttribute('placeholder') || '',
            label: el.getAttribute('aria-label') || '',
            value: (el.value || '').slice(0, 30),
          };
        });
        var buttons = Array.from(document.querySelectorAll('button, input[type="submit"], input[type="button"], [role="button"]')).map(function(b){
          return ((b.textContent||'').trim() || b.getAttribute('aria-label') || b.value || '').slice(0, 40);
        }).filter(Boolean);
        return { inputs: inputs.slice(0, 20), buttons: buttons.slice(0, 20) };
      })()`) as { inputs: { tag: string; type: string; name: string; id: string; placeholder: string; label: string; value: string }[]; buttons: string[] }
      logger.info(`[LINE Bank] /transaction inputs: ${JSON.stringify(txForm.inputs)}`)
      logger.info(`[LINE Bank] /transaction buttons: [${txForm.buttons.join(' | ')}]`)

      // 嘗試點擊「查詢」按鈕
      const queryClicked = await page.evaluate(`(function() {
        var btns = Array.from(document.querySelectorAll('button, input[type="submit"], [role="button"]'));
        for (var i = 0; i < btns.length; i++) {
          var t = (btns[i].textContent || btns[i].getAttribute('aria-label') || btns[i].value || '').trim();
          if (/查詢|確定|送出|submit/i.test(t)) {
            btns[i].click();
            return t;
          }
        }
        return '';
      })()`) as string
      if (queryClicked) {
        logger.info(`[LINE Bank] 已點擊 "${queryClicked}" 按鈕`)
        await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {})
        await page.waitForTimeout(3000)
      }

      // 等到有任何含「主帳戶」字樣、可用餘額或 NT$ 金額的文字出現為止
      await page.waitForFunction(
        `document.body && /主帳戶|可用餘額|結餘|NT\\$\\s*\\d/.test(document.body.innerText)`,
        { timeout: 15000 },
      ).catch(() => {})
      await page.waitForTimeout(2000)

      const data = await page.evaluate(`(function() {
        var headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, [role="heading"]'));
        var headingTexts = headings.map(function(el){ return (el.textContent||'').trim(); }).filter(Boolean);
        // 優先挑含「主帳戶」或多位數字的標題
        var acctLine = headingTexts.find(function(t){ return /主帳戶|\\d[\\d-]{8,}/.test(t); }) || '';
        // fallback：從整頁抓「主帳戶 xxx-xxxx-xxxxx」或「主帳戶 (xxxxxxx)」
        var bodyText = document.body ? document.body.innerText : '';
        if (!acctLine) {
          var m = bodyText.match(/主帳戶[^\\n]*/);
          if (m) acctLine = m[0];
        }
        // fallback 2：整頁找連續 10+ 位數字（可含 dash）
        if (!acctLine) {
          var m2 = bodyText.match(/\\d[\\d-]{9,20}\\d/);
          if (m2) acctLine = m2[0];
        }
        // 多種餘額關鍵字 + 金額 pattern，擴大匹配
        var balLine = '';
        var balKeywords = ['可用餘額', '帳戶餘額', '帳戶結餘', '存款餘額', '可動用', '結餘', '餘額'];
        for (var k = 0; k < balKeywords.length && !balLine; k++) {
          var re = new RegExp(balKeywords[k] + '[^\\n]*');
          var mb = bodyText.match(re);
          if (mb) balLine = mb[0];
        }
        // 整頁所有 NT$ 金額（>= 1 元），方便 debug
        var ntMatches = bodyText.match(/NT\\$\\s*[\\d,]+/g) || [];
        return {
          acctLine: acctLine,
          balLine: balLine,
          headingSample: headingTexts.slice(0, 5).join(' | '),
          bodySnippet: bodyText.slice(0, 2000),
          ntAmounts: ntMatches.slice(0, 10),
        };
      })()`) as { acctLine: string; balLine: string; headingSample: string; bodySnippet: string; ntAmounts: string[] }

      // 優先抓括號裡的純數字；否則抓「主帳戶」後面的數字+dash 組合；最後抓任何 10+ 位數字序列
      const acctMatch =
        data.acctLine.match(/\((\d+)\)/) ??
        data.acctLine.match(/主帳戶\s*[：:]?\s*([\d-]{10,})/) ??
        data.acctLine.match(/(\d[\d-]{9,20}\d)/)
      const accountNumber = acctMatch ? acctMatch[1].replace(/-/g, '') : ''

      // 從 /transaction 再嘗試抓一次，否則沿用首頁預解析的餘額
      let balance = prelimBalance
      let balSource = prelimSource
      const balMatch = data.balLine.match(/NT\$[\s]*([\d,]+)/) ?? data.balLine.match(/([\d,]+)/)
      if (balMatch) {
        balance = parseFloat(balMatch[1].replace(/,/g, ''))
        balSource = `transaction balLine="${data.balLine.slice(0, 80)}"`
      } else if (data.ntAmounts.length > 0 && balance === 0) {
        const firstNT = data.ntAmounts[0].match(/([\d,]+)/)
        if (firstNT) {
          balance = parseFloat(firstNT[1].replace(/,/g, ''))
          balSource = `transaction ntAmounts[0]=${data.ntAmounts[0]}`
        }
      }

      if (accountNumber) {
        deposits.push({
          accountNumber,
          balance,
          currency: 'TWD',
          accountType: 'savings',
        })
        logger.info(`[LINE Bank] 主帳戶 ${accountNumber}, 餘額 ${balance} (來源: ${balSource})`)
        if (balance === 0) {
          logger.warn(`[LINE Bank] 餘額為 0，NT$ matches: [${data.ntAmounts.join(', ')}], body: "${data.bodySnippet.slice(0, 600)}"`)
        }
      } else {
        logger.warn(`[LINE Bank] 無法解析帳號，headings: "${data.headingSample}" body: "${data.bodySnippet.slice(0, 400)}"`)
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
