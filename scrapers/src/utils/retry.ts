import { logger } from './logger.js'

/**
 * 帶指數退避的重試機制
 */
export async function retry<T>(
  fn: () => Promise<T>,
  label: string,
  maxRetries: number,
): Promise<T> {
  let lastError: unknown
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error
      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000 // 2s, 4s, 8s...
        logger.warn(`${label} 第 ${attempt} 次失敗，${delay / 1000}s 後重試...`)
        await new Promise((r) => setTimeout(r, delay))
      }
    }
  }
  throw lastError
}
