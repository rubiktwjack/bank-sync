import type { Page } from 'playwright'
import { BaseScraper } from '../base-scraper.js'
import type { BankCredentials, ScrapedDeposit, ScrapedForeignDeposit, ScrapedCreditCard } from '../types.js'
import { logger } from '../utils/logger.js'
import Tesseract from 'tesseract.js'

/**
 * 永豐銀行爬蟲
 * 網銀網址：https://mma.sinopac.com/
 *
 * 登入結構：
 * - ASP.NET WebForms，無 iframe
 * - 欄位 ID 每次載入都不同（動態 GUID），用屬性選擇器定位
 * - 驗證碼圖片 #imgCode（6 位數字，Tesseract OCR）
 *
 * 帳務結構：
 * - 資產總覽 mma_assets_summary.aspx → table#tbasset 列出所有存款帳戶
 * - 信用卡近期帳單 SinoCard/Account/StatementInquiry → .ntable 有帳單金額
 */
export class SinopacScraper extends BaseScraper {
  readonly bankId = 'sinopac'
  readonly bankName = '永豐銀行'
  readonly loginUrl = 'https://mma.sinopac.com/MemberPortal/Member/NextWebLogin.aspx'

  async login(page: Page, credentials: BankCredentials): Promise<boolean> {
    const custid = credentials.extra?.custid || ''
    if (!custid) {
      logger.error('[永豐銀行] 缺少身分證字號 (extra.custid)')
      return false
    }

    await page.waitForTimeout(5000)

    // 追蹤最近的 dialog 訊息
    let lastDialogMsg = ''
    page.on('dialog', async dialog => {
      lastDialogMsg = dialog.message()
      logger.info(`[永豐銀行] Dialog: ${lastDialogMsg}`)
      await dialog.accept()
    })

    for (let attempt = 1; attempt <= 8; attempt++) {
      logger.info(`[永豐銀行] 登入嘗試 ${attempt}/8`)

      // 動態 ID，用 evaluate 找到 MMA 開頭的 text input
      await page.evaluate(`(function(custid, username, password) {
        var inputs = document.querySelectorAll('input[type="text"]');
        var textInputs = [];
        for (var i = 0; i < inputs.length; i++) {
          var inp = inputs[i];
          if (inp.id && inp.id.indexOf('MMA') >= 0 && inp.placeholder !== '驗證碼' && inp.id.indexOf('keyword') < 0) {
            textInputs.push(inp);
          }
        }
        if (textInputs.length >= 3) {
          textInputs[0].value = custid;
          textInputs[1].value = username;
          textInputs[2].value = password;
        }
        var hiddenId = document.querySelector('input[id$="hiddenId"]');
        if (hiddenId) hiddenId.value = custid.toUpperCase();
      })(${JSON.stringify(custid)}, ${JSON.stringify(credentials.username)}, ${JSON.stringify(credentials.password)})`)

      // OCR 驗證碼
      const captchaText = await this.solveCaptcha(page)
      if (!captchaText) {
        logger.warn('[永豐銀行] 驗證碼辨識失敗，重新整理')
        if (attempt < 8) {
          await page.reload({ waitUntil: 'load' })
          await page.waitForTimeout(3000)
          continue
        }
        return false
      }

      logger.info(`[永豐銀行] 驗證碼: ${captchaText}`)

      // 填驗證碼
      await page.evaluate(`(function(c) {
        var inp = document.querySelector('input[placeholder="驗證碼"]');
        if (inp) inp.value = c;
      })(${JSON.stringify(captchaText)})`)

      // 點擊提交
      await page.evaluate(`(function() {
        var btn = document.querySelector('input[type="image"][id$="_submitButton"]');
        if (!btn) btn = document.querySelector('input[type="image"][id$="_loginButton"]');
        if (btn) btn.click();
      })()`)

      await page.waitForTimeout(10000)

      const currentUrl = page.url()
      logger.info(`[永豐銀行] 結果 URL: ${currentUrl}, 最近 dialog: ${lastDialogMsg}`)

      // 如果 dialog 包含驗證碼錯誤，不算登入成功
      if (lastDialogMsg.includes('驗證碼')) {
        logger.warn('[永豐銀行] 驗證碼錯誤')
        lastDialogMsg = ''
        if (attempt < 8) {
          await page.reload({ waitUntil: 'load' })
          await page.waitForTimeout(3000)
        }
        continue
      }

      // 成功登入：頁面標題不含「登入」
      const title = await page.title()
      if (!title.includes('登入')) {
        logger.info('[永豐銀行] 登入成功')
        return true
      }

      // 還在登入頁，reload 重試
      if (attempt < 8) {
        await page.reload({ waitUntil: 'load' })
        await page.waitForTimeout(3000)
      }
    }

    return false
  }

  private async solveCaptcha(page: Page): Promise<string | null> {
    try {
      await page.waitForSelector('#imgCode', { timeout: 5000 })
      await page.waitForTimeout(1000)

      // 瀏覽器端 fetch + canvas 預處理：統計像素顏色，移除彩色干擾線
      const base64 = await page.evaluate(`(async function() {
        try {
          var img = document.getElementById('imgCode');
          if (!img || !img.src) return '';
          var resp = await fetch(img.src);
          var blob = await resp.blob();
          var bmp = await createImageBitmap(blob);
          // 先在原始尺寸處理
          var ow = bmp.width, oh = bmp.height;
          var c1 = document.createElement('canvas');
          c1.width = ow; c1.height = oh;
          var x1 = c1.getContext('2d');
          x1.drawImage(bmp, 0, 0);
          var id = x1.getImageData(0, 0, ow, oh);
          var d = id.data;

          // Step 1: 統計每個顏色出現次數（量化到 8 位色，減少顏色數）
          var colorCount = {};
          for (var i = 0; i < d.length; i += 4) {
            // 量化：每通道除以 32 再乘 32
            var rq = (d[i] >> 5) << 5;
            var gq = (d[i+1] >> 5) << 5;
            var bq = (d[i+2] >> 5) << 5;
            var key = rq + ',' + gq + ',' + bq;
            colorCount[key] = (colorCount[key] || 0) + 1;
          }

          // Step 2: 找出最常見的兩個顏色（背景 + 數字）
          var sorted = Object.entries(colorCount).sort(function(a,b) { return b[1] - a[1]; });
          var keepColors = {};
          // 保留前 2 個最常見顏色
          for (var j = 0; j < Math.min(2, sorted.length); j++) {
            keepColors[sorted[j][0]] = true;
          }

          // Step 3: 非保留顏色 → 白色
          for (var i = 0; i < d.length; i += 4) {
            var rq = (d[i] >> 5) << 5;
            var gq = (d[i+1] >> 5) << 5;
            var bq = (d[i+2] >> 5) << 5;
            var key = rq + ',' + gq + ',' + bq;
            if (!keepColors[key]) {
              d[i] = d[i+1] = d[i+2] = 255;
            }
          }

          // Step 4: 灰階化 + 二值化
          for (var i = 0; i < d.length; i += 4) {
            var gray = 0.299 * d[i] + 0.587 * d[i+1] + 0.114 * d[i+2];
            var val = gray < 160 ? 0 : 255;
            d[i] = d[i+1] = d[i+2] = val;
          }
          x1.putImageData(id, 0, 0);

          // Step 5: 放大 4 倍輸出
          var scale = 4;
          var c2 = document.createElement('canvas');
          c2.width = ow * scale; c2.height = oh * scale;
          var x2 = c2.getContext('2d');
          x2.imageSmoothingEnabled = false;
          x2.drawImage(c1, 0, 0, c2.width, c2.height);
          return c2.toDataURL('image/png').split(',')[1];
        } catch(e) { return 'ERR:' + e.message; }
      })()`) as string

      let imgBuf: Buffer
      if (base64 && !base64.startsWith('ERR:')) {
        imgBuf = Buffer.from(base64, 'base64')
      } else {
        if (base64 && base64.startsWith('ERR:')) {
          logger.info(`[永豐銀行] Canvas 失敗: ${base64}, 改用截圖`)
        }
        const imgEl = page.locator('#imgCode')
        imgBuf = await imgEl.screenshot({ timeout: 5000 })
      }

      const worker = await Tesseract.createWorker('eng')
      await worker.setParameters({
        tessedit_char_whitelist: '0123456789',
        tessedit_pageseg_mode: Tesseract.PSM.SINGLE_LINE,
      })

      const { data: { text } } = await worker.recognize(imgBuf)
      await worker.terminate()

      const cleaned = text.replace(/\D/g, '')
      if (cleaned.length === 6) return cleaned
      if (cleaned.length > 0) {
        logger.info(`[永豐銀行] OCR 結果 "${cleaned}" (${cleaned.length}碼)`)
      }
      return null
    } catch (error) {
      logger.error(`[永豐銀行] 驗證碼 OCR 失敗: ${error}`)
      return null
    }
  }

  async scrapeDeposits(page: Page): Promise<ScrapedDeposit[]> {
    const deposits: ScrapedDeposit[] = []
    try {
      await page.goto('https://mma.sinopac.com/mma/mymma/myasset/mma_assets_summary.aspx', { waitUntil: 'load' })
      await page.waitForTimeout(5000)

      const rows = await page.evaluate(`(function() {
        var table = document.getElementById('tbasset');
        if (!table) return [];
        var data = [];
        for (var r = 1; r < table.rows.length; r++) {
          var cells = table.rows[r].cells;
          if (cells.length < 3) continue;
          data.push({
            account: cells[0].textContent.trim(),
            currency: cells[1].textContent.trim(),
            balance: cells[2].textContent.trim(),
            timeDeposit: cells.length > 3 ? cells[3].textContent.trim() : '0'
          });
        }
        return data;
      })()`) as Array<{ account: string, currency: string, balance: string, timeDeposit: string }>

      for (const row of rows) {
        if (!row.currency.includes('TWD') && !row.currency.includes('新台幣')) continue

        const balanceNum = parseFloat(row.balance.replace(/,/g, ''))
        if (isNaN(balanceNum)) continue

        const acctMatch = row.account.match(/(\d{3}-\d{3}-\d{7}-\d)/)
        const accountNumber = acctMatch ? acctMatch[1] : row.account
        const nickname = row.account.replace(/\d{3}-\d{3}-\d{7}-\d/, '').trim()

        deposits.push({
          accountNumber,
          balance: balanceNum,
          currency: 'TWD',
          accountType: 'savings',
          nickname: nickname || '永豐存款',
        })
      }
    } catch (error) {
      logger.error(`[永豐銀行] 爬取台幣存款失敗: ${error}`)
    }
    return deposits
  }

  async scrapeForeignDeposits(page: Page): Promise<ScrapedForeignDeposit[]> {
    const deposits: ScrapedForeignDeposit[] = []
    try {
      // 資產總覽可能已在 scrapeDeposits 載入
      if (!page.url().includes('mma_assets_summary')) {
        await page.goto('https://mma.sinopac.com/mma/mymma/myasset/mma_assets_summary.aspx', { waitUntil: 'load' })
        await page.waitForTimeout(5000)
      }

      const rows = await page.evaluate(`(function() {
        var table = document.getElementById('tbasset');
        if (!table) return [];
        var data = [];
        for (var r = 1; r < table.rows.length; r++) {
          var cells = table.rows[r].cells;
          if (cells.length < 3) continue;
          data.push({
            account: cells[0].textContent.trim(),
            currency: cells[1].textContent.trim(),
            balance: cells[2].textContent.trim()
          });
        }
        return data;
      })()`) as Array<{ account: string, currency: string, balance: string }>

      for (const row of rows) {
        if (row.currency.includes('TWD') || row.currency.includes('新台幣')) continue

        const balanceNum = parseFloat(row.balance.replace(/,/g, ''))
        if (isNaN(balanceNum)) continue

        const acctMatch = row.account.match(/(\d{3}-\d{3}-\d{7}-\d)/)
        const accountNumber = acctMatch ? acctMatch[1] : row.account
        const nickname = row.account.replace(/\d{3}-\d{3}-\d{7}-\d/, '').trim()

        // 提取 ISO 幣別代碼
        const codeMatch = row.currency.match(/([A-Z]{3})/)
        const currency = codeMatch ? codeMatch[1] : row.currency

        deposits.push({
          accountNumber,
          balance: balanceNum,
          currency,
          nickname: nickname || `永豐外幣 ${currency}`,
        })
      }
    } catch (error) {
      logger.error(`[永豐銀行] 爬取外幣存款失敗: ${error}`)
    }
    return deposits
  }

  async scrapeCreditCards(page: Page): Promise<ScrapedCreditCard[]> {
    const cards: ScrapedCreditCard[] = []
    try {
      await page.goto('https://mma.sinopac.com/SinoCard/Account/StatementInquiry', { waitUntil: 'load' })
      await page.waitForTimeout(5000)

      // 從帳單頁解析信用卡資訊
      const cardData = await page.evaluate(`(function() {
        var result = { totalDue: 0, minDue: 0, dueDate: '', cardLast4: '' };

        // 找帳單金額表格（第二個 .ntable，有「本期應繳總金額」欄位）
        var tables = document.querySelectorAll('table.ntable');
        for (var t = 0; t < tables.length; t++) {
          var headers = tables[t].rows[0];
          if (!headers) continue;
          var headerText = headers.textContent;
          if (headerText.indexOf('本期應繳') >= 0 && headerText.indexOf('幣別') >= 0) {
            // 找台幣行
            for (var r = 1; r < tables[t].rows.length; r++) {
              var cells = tables[t].rows[r].cells;
              if (cells.length >= 8 && cells[0].textContent.trim().indexOf('臺幣') >= 0) {
                result.totalDue = cells[6].textContent.trim().replace(/,/g, '');
                result.minDue = cells[7].textContent.trim().replace(/,/g, '');
              }
            }
          }
          // 找卡號末四碼（消費明細表）
          if (headerText.indexOf('卡號末四碼') >= 0) {
            for (var r = 1; r < tables[t].rows.length; r++) {
              var cells = tables[t].rows[r].cells;
              if (cells.length >= 4 && cells[2].textContent.trim().match(/\\d{4}/)) {
                result.cardLast4 = cells[2].textContent.trim();
                break;
              }
            }
          }
        }

        // 找繳款截止日
        var allText = document.body.innerText;
        var dueDateMatch = allText.match(/繳款截止日[：:]\\s*(\\d{4}\\/\\d{2}\\/\\d{2})/);
        if (dueDateMatch) result.dueDate = dueDateMatch[1];

        return result;
      })()`) as { totalDue: string, minDue: string, dueDate: string, cardLast4: string }

      const totalDue = parseFloat(cardData.totalDue) || 0
      const minDue = parseFloat(cardData.minDue) || 0

      if (cardData.cardLast4 || totalDue > 0) {
        cards.push({
          cardNumber: `*${cardData.cardLast4 || '****'}`,
          cardName: `永豐信用卡 *${cardData.cardLast4 || '****'}`,
          creditLimit: 0,
          currentBalance: totalDue,
          minimumPayment: minDue,
          dueDate: cardData.dueDate,
        })
        logger.info(`[永豐銀行] 信用卡應繳: ${totalDue}, 截止日: ${cardData.dueDate}`)
      } else {
        logger.info('[永豐銀行] 無信用卡應繳金額')
      }
    } catch (error) {
      logger.error(`[永豐銀行] 爬取信用卡失敗: ${error}`)
    }
    return cards
  }
}
