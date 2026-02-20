import 'dotenv/config'
import { writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { createScraper, getAvailableBanks } from './banks/index.js'
import { retry } from './utils/retry.js'
import { logger } from './utils/logger.js'
import { encrypt } from './utils/crypto.js'
import type { BankConfig, ScraperConfig, SyncResult } from './types.js'

/**
 * 從環境變數讀取銀行設定
 *
 * 環境變數格式：
 *   BANK_CATHAY_ENABLED=true
 *   BANK_XXX_USERNAME=<your-username>
 *   BANK_XXX_PASSWORD=<your-password>
 *   BANK_XXX_EXTRA_FIELD=<value>
 *
 * 每家銀行的 prefix 是 BANK_{BANKID_UPPER}_
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

async function main() {
  logger.info('=== Bank Sync 爬蟲啟動 ===')

  const isDryRun = process.argv.includes('--dry-run')
  const config = loadConfig()

  if (isDryRun) {
    logger.info('[Dry Run] 設定檢查:')
    logger.info(`  可用銀行: ${getAvailableBanks().join(', ')}`)
    logger.info(`  已啟用: ${config.banks.map((b) => b.bankId).join(', ') || '(無)'}`)
    logger.info(`  Headless: ${config.headless}`)
    logger.info(`  Timeout: ${config.timeout}ms`)
    logger.info(`  Retries: ${config.retries}`)
    logger.info(`  Output: ${config.outputPath}`)
    return
  }

  const result: SyncResult = {
    syncedAt: new Date().toISOString(),
    banks: [],
  }

  for (const bankConfig of config.banks) {
    logger.info(`\n--- 開始爬取: ${bankConfig.bankId} ---`)
    const scraper = createScraper(bankConfig.bankId)

    const bankResult = await retry(
      () => scraper.run(bankConfig.credentials, {
        headless: config.headless,
        timeout: config.timeout,
      }),
      bankConfig.bankId,
      config.retries,
    )

    result.banks.push(bankResult)
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
  if (process.env.SYNC_ENCRYPTION_KEY) {
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
    process.exit(1)
  }
}

main().catch((error) => {
  logger.error(`致命錯誤: ${error}`)
  process.exit(1)
})
