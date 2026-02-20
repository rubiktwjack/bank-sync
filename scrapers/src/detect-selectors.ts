/**
 * 偵測腳本：自動分析玉山網銀登入頁面的 DOM 結構
 *
 * 用法：
 *   cd scrapers && npm install && npx tsx src/detect-selectors.ts
 *
 * 這個腳本會：
 * 1. 用 Playwright 開啟玉山網銀登入頁面
 * 2. 自動找出所有 input、button、form 元素
 * 3. 印出它們的 id、name、type、placeholder 等屬性
 * 4. 截圖存檔供參考
 *
 * 不會輸入任何帳密，只是讀取頁面結構。
 */

import { chromium } from 'playwright'

async function detectSelectors() {
  console.log('=== 玉山網銀登入頁面偵測 ===\n')

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    locale: 'zh-TW',
    timezoneId: 'Asia/Taipei',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  })
  const page = await context.newPage()

  console.log('前往 https://ebank.esunbank.com.tw/ ...\n')
  await page.goto('https://ebank.esunbank.com.tw/', { waitUntil: 'networkidle', timeout: 30000 })

  // 截圖
  await page.screenshot({ path: 'esun-login-screenshot.png', fullPage: true })
  console.log('截圖已存: esun-login-screenshot.png\n')

  // 分析主頁面
  console.log('─── 主頁面 ───')
  console.log(`URL: ${page.url()}`)
  console.log(`Title: ${await page.title()}\n`)

  await analyzeFrame(page, '主頁面')

  // 分析所有 iframe
  const frames = page.frames()
  if (frames.length > 1) {
    console.log(`\n偵測到 ${frames.length - 1} 個 iframe:\n`)
    for (let i = 1; i < frames.length; i++) {
      const frame = frames[i]
      console.log(`─── iframe #${i} ───`)
      console.log(`URL: ${frame.url()}`)
      console.log(`Name: ${frame.name() || '(無)'}`)
      await analyzeFrame(frame, `iframe #${i}`)
    }
  } else {
    console.log('沒有偵測到 iframe')
  }

  await browser.close()
  console.log('\n=== 偵測完成 ===')
}

async function analyzeFrame(frame: any, label: string) {
  // 找所有 input
  const inputs = await frame.$$eval('input', (els: HTMLInputElement[]) =>
    els.map(el => ({
      tag: 'input',
      id: el.id || null,
      name: el.name || null,
      type: el.type || null,
      placeholder: el.placeholder || null,
      className: el.className || null,
      'aria-label': el.getAttribute('aria-label') || null,
      autocomplete: el.getAttribute('autocomplete') || null,
      maxlength: el.getAttribute('maxlength') || null,
      visible: el.offsetParent !== null,
    }))
  ).catch(() => [])

  if (inputs.length > 0) {
    console.log(`\n[${label}] 找到 ${inputs.length} 個 <input>:`)
    for (const input of inputs) {
      console.log(`  ${JSON.stringify(input)}`)
    }
  }

  // 找所有 button
  const buttons = await frame.$$eval('button, input[type="submit"], input[type="button"], a[role="button"]', (els: HTMLElement[]) =>
    els.map(el => ({
      tag: el.tagName.toLowerCase(),
      id: el.id || null,
      type: el.getAttribute('type') || null,
      text: el.textContent?.trim().slice(0, 50) || null,
      className: el.className || null,
      'aria-label': el.getAttribute('aria-label') || null,
      visible: el.offsetParent !== null,
    }))
  ).catch(() => [])

  if (buttons.length > 0) {
    console.log(`\n[${label}] 找到 ${buttons.length} 個 button/submit:`)
    for (const btn of buttons) {
      console.log(`  ${JSON.stringify(btn)}`)
    }
  }

  // 找所有 form
  const forms = await frame.$$eval('form', (els: HTMLFormElement[]) =>
    els.map(el => ({
      tag: 'form',
      id: el.id || null,
      name: el.name || null,
      action: el.action || null,
      method: el.method || null,
      className: el.className || null,
    }))
  ).catch(() => [])

  if (forms.length > 0) {
    console.log(`\n[${label}] 找到 ${forms.length} 個 <form>:`)
    for (const form of forms) {
      console.log(`  ${JSON.stringify(form)}`)
    }
  }

  // 找所有 select
  const selects = await frame.$$eval('select', (els: HTMLSelectElement[]) =>
    els.map(el => ({
      tag: 'select',
      id: el.id || null,
      name: el.name || null,
      className: el.className || null,
      options: Array.from(el.options).map(o => o.text.trim()).slice(0, 10),
    }))
  ).catch(() => [])

  if (selects.length > 0) {
    console.log(`\n[${label}] 找到 ${selects.length} 個 <select>:`)
    for (const sel of selects) {
      console.log(`  ${JSON.stringify(sel)}`)
    }
  }

  // 找可能的登入相關文字標籤
  const labels = await frame.$$eval('label', (els: HTMLLabelElement[]) =>
    els.map(el => ({
      tag: 'label',
      for: el.htmlFor || null,
      text: el.textContent?.trim().slice(0, 50) || null,
    }))
  ).catch(() => [])

  if (labels.length > 0) {
    console.log(`\n[${label}] 找到 ${labels.length} 個 <label>:`)
    for (const lbl of labels) {
      console.log(`  ${JSON.stringify(lbl)}`)
    }
  }

  if (inputs.length === 0 && buttons.length === 0 && forms.length === 0) {
    console.log(`\n[${label}] 沒有找到表單元素`)
  }
}

detectSelectors().catch(err => {
  console.error('偵測失敗:', err)
  process.exit(1)
})
