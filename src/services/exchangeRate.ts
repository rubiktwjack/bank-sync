import { ref } from 'vue'

/** 匯率表：幣別 → 對 TWD 的匯率（1 外幣 = ? TWD） */
export const rates = ref<Record<string, number>>({})
export const ratesLoadedAt = ref<Date | null>(null)

const CACHE_MS = 30 * 60 * 1000 // 30 分鐘快取

/**
 * 取得即時匯率（1 外幣 = ? TWD）
 * 使用免費 API，30 分鐘內重複呼叫會回傳快取
 */
export async function loadRates(): Promise<Record<string, number>> {
  if (ratesLoadedAt.value && Date.now() - ratesLoadedAt.value.getTime() < CACHE_MS) {
    return rates.value
  }

  try {
    const res = await fetch('https://open.er-api.com/v6/latest/TWD')
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    // API 回傳 1 TWD = X 外幣，反轉成 1 外幣 = ? TWD
    const result: Record<string, number> = {}
    for (const [currency, rate] of Object.entries(data.rates as Record<string, number>)) {
      if (rate > 0) result[currency] = 1 / rate
    }
    rates.value = result
    ratesLoadedAt.value = new Date()
    return result
  } catch {
    // 如果已有舊資料就用舊的
    if (Object.keys(rates.value).length > 0) return rates.value
    throw new Error('無法取得匯率資料')
  }
}

/**
 * 將外幣金額換算成 TWD
 */
export function toTWD(amount: number, currency: string): number {
  if (currency === 'TWD') return amount
  const rate = rates.value[currency]
  if (!rate) return 0
  return amount * rate
}
