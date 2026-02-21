import type { BaseExchange } from './base-exchange.js'
import { BingxExchange } from './bingx.js'
import { BinanceExchange } from './binance.js'
import { BybitExchange } from './bybit.js'

const registry: Record<string, () => BaseExchange> = {
  bingx: () => new BingxExchange(),
  binance: () => new BinanceExchange(),
  bybit: () => new BybitExchange(),
}

export function createExchange(exchangeId: string): BaseExchange {
  const factory = registry[exchangeId]
  if (!factory) {
    throw new Error(`未知的交易所: ${exchangeId}，可用: ${Object.keys(registry).join(', ')}`)
  }
  return factory()
}

export function getAvailableExchanges(): string[] {
  return Object.keys(registry)
}
