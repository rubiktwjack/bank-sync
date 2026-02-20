export function formatCurrency(amount: number, currency = 'TWD'): string {
  const absAmount = Math.abs(amount)

  if (currency === 'TWD') {
    return `NT$ ${absAmount.toLocaleString('zh-TW', { maximumFractionDigits: 0 })}`
  }

  const symbols: Record<string, string> = {
    USD: '$',
    JPY: '¥',
    EUR: '€',
    GBP: '£',
    CNY: '¥',
    AUD: 'A$',
    HKD: 'HK$',
  }

  const symbol = symbols[currency] || currency + ' '
  const decimals = currency === 'JPY' ? 0 : 2

  return `${symbol}${absAmount.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`
}

export function formatCompact(amount: number): string {
  const abs = Math.abs(amount)
  if (abs >= 100_000_000) return `${(amount / 100_000_000).toFixed(1)}億`
  if (abs >= 10_000) return `${(amount / 10_000).toFixed(1)}萬`
  return amount.toLocaleString('zh-TW')
}

export function maskAccountNumber(accountNumber: string): string {
  if (accountNumber.length <= 4) return accountNumber
  return '****' + accountNumber.slice(-4)
}

export function formatDate(date: Date): string {
  const d = new Date(date)
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`
}

export function timeAgo(date: Date): string {
  const now = new Date()
  const d = new Date(date)
  const diffMs = now.getTime() - d.getTime()
  const diffMin = Math.floor(diffMs / 60000)

  if (diffMin < 1) return '剛剛'
  if (diffMin < 60) return `${diffMin}分鐘前`

  const diffHours = Math.floor(diffMin / 60)
  if (diffHours < 24) return `${diffHours}小時前`

  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 30) return `${diffDays}天前`

  return formatDate(date)
}
