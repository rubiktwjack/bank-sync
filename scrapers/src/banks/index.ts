import type { BaseScraper } from '../base-scraper.js'
import { CtbcScraper } from './ctbc.js'
import { EsunScraper } from './esun.js'
import { FeibScraper } from './feib.js'
import { SinopacScraper } from './sinopac.js'
import { LinebankScraper } from './linebank.js'

/**
 * 銀行爬蟲註冊表
 *
 * 新增銀行步驟：
 * 1. 在 banks/ 下新建 xxx.ts，繼承 BaseScraper
 * 2. 實作 login() 和需要的 scrapeXxx() 方法
 * 3. 在這裡 import 並加入 registry
 * 4. 在 GitHub Secrets 加入對應的帳密環境變數
 */
const registry: Record<string, () => BaseScraper> = {
  esun: () => new EsunScraper(),
  ctbc: () => new CtbcScraper(),
  feib: () => new FeibScraper(),
  sinopac: () => new SinopacScraper(),
  linebank: () => new LinebankScraper(),
}

export function createScraper(bankId: string): BaseScraper {
  const factory = registry[bankId]
  if (!factory) {
    throw new Error(`未知的銀行: ${bankId}，可用的銀行: ${Object.keys(registry).join(', ')}`)
  }
  return factory()
}

export function getAvailableBanks(): string[] {
  return Object.keys(registry)
}
