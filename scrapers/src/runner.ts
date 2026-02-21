import 'dotenv/config'
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { createScraper, getAvailableBanks } from './banks/index.js'
import { createExchange, getAvailableExchanges } from './exchanges/index.js'
import type { ExchangeCredentials } from './exchanges/base-exchange.js'
import { retry } from './utils/retry.js'
import { logger } from './utils/logger.js'
import { encrypt, decrypt } from './utils/crypto.js'
import type { BankConfig, BankScrapedData, ScraperConfig, SyncResult } from './types.js'

/**
 * 從環境變數讀取銀行設定
 */
function loadBankConfigs(): BankConfig[] {
  const configs: BankConfig[] = []
  const availableBanks = getAvailableBanks()

  for (const bankId of availableBanks) {
    const prefix = `BANK_${bankId.toUpperCase()}_`
    const enabled = process.env[`${prefix}ENABLED`] === 'true'

    if (!enabled) continue

    const username = process.env[`${prefix}USERNAME`] ?? ''
    const password = process.env[`${prefix}PASSWORD`] ?? ''

    if (!username || !password) {
      logger.warn(`${bankId} 已啟用但缺少帳密，跳過`)
      continue
    }

    // 收集額外欄位 (BANK_XXX_EXTRA_yyy=zzz)
    const extraPrefix = `${prefix}EXTRA_`
    const extra: Record<string, string> = {}
    for (const [key, value] of Object.entries(process.env)) {
      if (key.startsWith(extraPrefix) && value) {
        const field = key.slice(extraPrefix.length).toLowerCase()
        extra[field] = value
      }
    }

    configs.push({
      bankId,
      enabled: true,
      credentials: {
        username,
        password,
        extra: Object.keys(extra).length > 0 ? extra : undefined,
      },
    })
  }

  return configs
}

function loadExchangeConfigs(): { exchangeId: string; credentials: ExchangeCredentials }[] {
  const configs: { exchangeId: string; credentials: ExchangeCredentials }[] = []
  for (const exchangeId of getAvailableExchanges()) {
    const prefix = `EXCHANGE_${exchangeId.toUpperCase()}_`
    if (process.env[`${prefix}ENABLED`] !== 'true') continue
    const apiKey = process.env[`${prefix}API_KEY`] ?? ''
    const secretKey = process.env[`${prefix}SECRET_KEY`] ?? ''
    if (!apiKey || !secretKey) {
      logger.warn(`${exchangeId} 已啟用但缺少 API Key，跳過`)
      continue
    }
    configs.push({ exchangeId, credentials: { apiKey, secretKey } })
  }
  return configs
}

/** 解析 --targets=esun,binance CLI 參數 */
function parseTargets(): string[] | null {
  const arg = process.argv.find(a => a.startsWith('--targets='))
  if (!arg) return null
  return arg.slice('--targets='.length).split(',').map(t => t.trim()).filter(Boolean)
}

function loadConfig(): ScraperConfig {
  const isDryRun = process.argv.includes('--dry-run')
  const banks = loadBankConfigs()

  if (banks.length === 0 && !isDryRun) {
    logger.warn('沒有啟用任何銀行，請設定環境變數 BANK_XXX_ENABLED=true')
    logger.info(`可用的銀行: ${getAvailableBanks().join(', ')}`)
  }

  return {
    banks,
    headless: process.env.SCRAPER_HEADLESS !== 'false',
    timeout: parseInt(process.env.SCRAPER_TIMEOUT ?? '30000', 10),
    retries: parseInt(process.env.SCRAPER_RETRIES ?? '2', 10),
    outputPath: process.env.SCRAPER_OUTPUT ?? resolve(import.meta.dirname, '../../data/latest.json'),
  }
}

/** 讀取現有結果（明文或從 .enc 解密） */
function loadExistingResult(outputPath: string): SyncResult {
  const empty: SyncResult = { syncedAt: '', banks: [] }

  // 先嘗試明文
  if (existsSync(outputPath)) {
    try {
      return JSON.parse(readFileSync(outputPath, 'utf-8'))
    } catch {
      return empty
    }
  }

  // 嘗試 .enc
  const encPath = outputPath + '.enc'
  if (existsSync(encPath) && process.env.SYNC_PASSWORD) {
    try {
      const enc = readFileSync(encPath, 'utf-8')
      return JSON.parse(decrypt(enc))
    } catch {
      return empty
    }
  }

  return empty
}

async function main() {
  logger.info('=== Bank Sync 爬蟲啟動 ===')

  const isDryRun = process.argv.includes('--dry-run')
  const config = loadConfig()
  const targets = parseTargets()

  if (isDryRun) {
    logger.info('[Dry Run] 設定檢查:')
    logger.info(`  可用銀行: ${getAvailableBanks().join(', ')}`)
    logger.info(`  已啟用: ${config.banks.map((b) => b.bankId).join(', ') || '(無)'}`)
    logger.info(`  Headless: ${config.headless}`)
    logger.info(`  Timeout: ${config.timeout}ms`)
    logger.info(`  Retries: ${config.retries}`)
    logger.info(`  Output: ${config.outputPath}`)
    if (targets) logger.info(`  Targets: ${targets.join(', ')}`)
    return
  }

  // 過濾目標
  const bankConfigs = targets
    ? config.banks.filter(b => targets.includes(b.bankId))
    : config.banks
  const exchangeConfigs = loadExchangeConfigs()
  const filteredExchanges = targets
    ? exchangeConfigs.filter(e => targets.includes(e.exchangeId))
    : exchangeConfigs

  if (targets) {
    logger.info(`指定目標: ${targets.join(', ')}`)
  }

  const newResults: BankScrapedData[] = []

  // 銀行爬蟲（依序）
  for (const bankConfig of bankConfigs) {
    logger.info(`\n--- 開始爬取: ${bankConfig.bankId} ---`)
    try {
      const scraper = createScraper(bankConfig.bankId)
      const bankResult = await retry(
        () => scraper.run(bankConfig.credentials, {
          headless: config.headless,
          timeout: config.timeout,
        }),
        bankConfig.bankId,
        config.retries,
      )
      newResults.push(bankResult)
    } catch (e) {
      logger.error(`${bankConfig.bankId} 爬取失敗: ${e}`)
      newResults.push({
        bankId: bankConfig.bankId,
        bankName: bankConfig.bankId,
        scrapedAt: new Date().toISOString(),
        success: false,
        error: e instanceof Error ? e.message : String(e),
        deposits: [],
        foreignDeposits: [],
        creditCards: [],
        loans: [],
      })
    }
  }

  // 交易所（並行）
  if (filteredExchanges.length > 0) {
    logger.info(`\n--- 並行查詢 ${filteredExchanges.length} 家交易所 ---`)
    const exchangeResults = await Promise.allSettled(
      filteredExchanges.map(async ({ exchangeId, credentials }) => {
        logger.info(`開始查詢: ${exchangeId}`)
        const exchange = createExchange(exchangeId)
        return exchange.run(credentials)
      }),
    )
    for (let i = 0; i < exchangeResults.length; i++) {
      const r = exchangeResults[i]
      const { exchangeId } = filteredExchanges[i]
      if (r.status === 'fulfilled') {
        newResults.push(r.value)
      } else {
        logger.error(`${exchangeId} 查詢失敗: ${r.reason}`)
        newResults.push({
          bankId: exchangeId,
          bankName: exchangeId,
          scrapedAt: new Date().toISOString(),
          success: false,
          error: r.reason instanceof Error ? r.reason.message : String(r.reason),
          deposits: [],
          foreignDeposits: [],
          creditCards: [],
          loans: [],
        })
      }
    }
  }

  // 合併到現有資料
  const targetIds = newResults.map(r => r.bankId)
  const existing = targets ? loadExistingResult(config.outputPath) : { syncedAt: '', banks: [] as BankScrapedData[] }
  const mergedBanks = existing.banks.filter(b => !targetIds.includes(b.bankId))
  mergedBanks.push(...newResults)

  const result: SyncResult = {
    syncedAt: new Date().toISOString(),
    banks: mergedBanks,
  }

  // 寫入結果
  const outputDir = dirname(config.outputPath)
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true })
  }
  const jsonStr = JSON.stringify(result, null, 2)
  writeFileSync(config.outputPath, jsonStr, 'utf-8')
  logger.info(`\n結果已寫入: ${config.outputPath}`)

  // 加密版本
  if (process.env.SYNC_PASSWORD) {
    const encPath = config.outputPath + '.enc'
    writeFileSync(encPath, encrypt(jsonStr), 'utf-8')
    logger.info(`加密版本已寫入: ${encPath}`)
  }

  // 摘要
  const successCount = result.banks.filter((b) => b.success).length
  const failCount = result.banks.filter((b) => !b.success).length
  logger.info(`\n=== 完成 ===`)
  logger.info(`成功: ${successCount}  失敗: ${failCount}`)

  if (failCount > 0) {
    for (const bank of result.banks.filter((b) => !b.success)) {
      logger.error(`${bank.bankName}: ${bank.error}`)
    }
  }
}

main().catch((error) => {
  logger.error(`致命錯誤: ${error}`)
  process.exit(1)
})
