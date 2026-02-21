import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { v4 as uuidv4 } from 'uuid'
import { db } from '../db/database'
import { toTWD, loadRates } from '../services/exchangeRate'
import { fetchStockPrices, stockMarketValueTWD, type StockQuote } from '../services/stockPrice'
import type {
  DepositAccount,
  ForeignDeposit,
  CreditCard,
  Loan,
  CustomAsset,
  StockHolding,
} from '../types'

export const useAssetStore = defineStore('assets', () => {
  const deposits = ref<DepositAccount[]>([])
  const foreignDeposits = ref<ForeignDeposit[]>([])
  const creditCards = ref<CreditCard[]>([])
  const loans = ref<Loan[]>([])
  const customAssets = ref<CustomAsset[]>([])
  const stocks = ref<StockHolding[]>([])
  const stockPrices = ref<Record<string, StockQuote>>({})
  const loading = ref(false)

  const totalDeposits = computed(() =>
    deposits.value.reduce((sum, d) => sum + d.balance, 0)
  )

  const totalForeignTWD = computed(() =>
    foreignDeposits.value.reduce((sum, f) => {
      // 優先用即時匯率，fallback 到存入時的 twdEquivalent
      const live = toTWD(f.balance, f.currency)
      return sum + (live > 0 ? live : f.twdEquivalent)
    }, 0)
  )

  const totalCustomAssets = computed(() =>
    customAssets.value
      .filter((a) => a.category === 'asset')
      .reduce((sum, a) => sum + a.value, 0)
  )

  const totalStocks = computed(() =>
    stocks.value.reduce(
      (sum, s) => sum + stockMarketValueTWD(s.shares, stockPrices.value[s.ticker]),
      0,
    )
  )

  const totalAssets = computed(() =>
    totalDeposits.value + totalForeignTWD.value + totalCustomAssets.value + totalStocks.value
  )

  const totalCreditCardDebt = computed(() =>
    creditCards.value.reduce((sum, c) => sum + c.currentBalance, 0)
  )

  const totalLoanBalance = computed(() =>
    loans.value.reduce((sum, l) => sum + l.remainingBalance, 0)
  )

  const totalCustomLiabilities = computed(() =>
    customAssets.value
      .filter((a) => a.category === 'liability')
      .reduce((sum, a) => sum + a.value, 0)
  )

  const totalLiabilities = computed(() =>
    totalCreditCardDebt.value + totalLoanBalance.value + totalCustomLiabilities.value
  )

  const netWorth = computed(() => totalAssets.value - totalLiabilities.value)

  async function loadAll() {
    loading.value = true
    try {
      deposits.value = await db.deposits.toArray()
      foreignDeposits.value = await db.foreignDeposits.toArray()
      creditCards.value = await db.creditCards.toArray()
      loans.value = await db.loans.toArray()
      customAssets.value = await db.customAssets.toArray()
      stocks.value = await db.stocks.toArray()
      // 載入匯率 + 股價
      await loadRates()
      if (stocks.value.length > 0) {
        const tickers = stocks.value.map((s) => s.ticker)
        stockPrices.value = await fetchStockPrices(tickers)
      }
    } finally {
      loading.value = false
    }
  }

  // Deposit CRUD
  async function addDeposit(data: Omit<DepositAccount, 'id' | 'lastUpdated' | 'source' | 'type'>) {
    const deposit: DepositAccount = {
      ...data,
      id: uuidv4(),
      type: 'deposit',
      lastUpdated: new Date(),
      source: 'manual',
    }
    await db.deposits.add(deposit)
    deposits.value.push(deposit)
    return deposit
  }

  async function updateDeposit(id: string, data: Partial<DepositAccount>) {
    await db.deposits.update(id, { ...data, lastUpdated: new Date() })
    const idx = deposits.value.findIndex((d) => d.id === id)
    const item = idx !== -1 ? deposits.value[idx] : undefined
    if (item) Object.assign(item, data, { lastUpdated: new Date() })
  }

  async function deleteDeposit(id: string) {
    await db.deposits.delete(id)
    deposits.value = deposits.value.filter((d) => d.id !== id)
  }

  // Foreign Deposit CRUD
  async function addForeignDeposit(data: Omit<ForeignDeposit, 'id' | 'lastUpdated' | 'source' | 'type'>) {
    const fd: ForeignDeposit = {
      ...data,
      id: uuidv4(),
      type: 'foreign_deposit',
      lastUpdated: new Date(),
      source: 'manual',
    }
    await db.foreignDeposits.add(fd)
    foreignDeposits.value.push(fd)
    return fd
  }

  async function updateForeignDeposit(id: string, data: Partial<ForeignDeposit>) {
    await db.foreignDeposits.update(id, { ...data, lastUpdated: new Date() })
    const idx = foreignDeposits.value.findIndex((f) => f.id === id)
    { const item = idx !== -1 ? foreignDeposits.value[idx] : undefined; if (item) Object.assign(item, data, { lastUpdated: new Date() }) }
  }

  async function deleteForeignDeposit(id: string) {
    await db.foreignDeposits.delete(id)
    foreignDeposits.value = foreignDeposits.value.filter((f) => f.id !== id)
  }

  // Credit Card CRUD
  async function addCreditCard(data: Omit<CreditCard, 'id' | 'lastUpdated' | 'source' | 'type'>) {
    const card: CreditCard = {
      ...data,
      id: uuidv4(),
      type: 'credit_card',
      lastUpdated: new Date(),
      source: 'manual',
    }
    await db.creditCards.add(card)
    creditCards.value.push(card)
    return card
  }

  async function updateCreditCard(id: string, data: Partial<CreditCard>) {
    await db.creditCards.update(id, { ...data, lastUpdated: new Date() })
    const idx = creditCards.value.findIndex((c) => c.id === id)
    { const item = idx !== -1 ? creditCards.value[idx] : undefined; if (item) Object.assign(item, data, { lastUpdated: new Date() }) }
  }

  async function deleteCreditCard(id: string) {
    await db.creditCards.delete(id)
    creditCards.value = creditCards.value.filter((c) => c.id !== id)
  }

  // Loan CRUD
  async function addLoan(data: Omit<Loan, 'id' | 'lastUpdated' | 'source' | 'type'>) {
    const loan: Loan = {
      ...data,
      id: uuidv4(),
      type: 'loan',
      lastUpdated: new Date(),
      source: 'manual',
    }
    await db.loans.add(loan)
    loans.value.push(loan)
    return loan
  }

  async function updateLoan(id: string, data: Partial<Loan>) {
    await db.loans.update(id, { ...data, lastUpdated: new Date() })
    const idx = loans.value.findIndex((l) => l.id === id)
    { const item = idx !== -1 ? loans.value[idx] : undefined; if (item) Object.assign(item, data, { lastUpdated: new Date() }) }
  }

  async function deleteLoan(id: string) {
    await db.loans.delete(id)
    loans.value = loans.value.filter((l) => l.id !== id)
  }

  // Custom Asset CRUD
  async function addCustomAsset(data: Omit<CustomAsset, 'id' | 'lastUpdated'>) {
    const asset: CustomAsset = {
      ...data,
      id: uuidv4(),
      lastUpdated: new Date(),
    }
    await db.customAssets.add(asset)
    customAssets.value.push(asset)
    return asset
  }

  async function updateCustomAsset(id: string, data: Partial<CustomAsset>) {
    await db.customAssets.update(id, { ...data, lastUpdated: new Date() })
    const idx = customAssets.value.findIndex((a) => a.id === id)
    { const item = idx !== -1 ? customAssets.value[idx] : undefined; if (item) Object.assign(item, data, { lastUpdated: new Date() }) }
  }

  async function deleteCustomAsset(id: string) {
    await db.customAssets.delete(id)
    customAssets.value = customAssets.value.filter((a) => a.id !== id)
  }

  // Stock CRUD
  async function addStock(data: Omit<StockHolding, 'id' | 'lastUpdated'>) {
    const stock: StockHolding = {
      ...data,
      id: uuidv4(),
      lastUpdated: new Date(),
    }
    await db.stocks.add(stock)
    stocks.value.push(stock)
    // 抓取股價
    const prices = await fetchStockPrices([stock.ticker])
    const quote = prices[stock.ticker]
    if (quote) {
      stockPrices.value = { ...stockPrices.value, ...prices }
      if (!stock.name && quote.name) {
        stock.name = quote.name
        await db.stocks.update(stock.id, { name: stock.name })
      }
    }
    return stock
  }

  async function updateStock(id: string, data: Partial<StockHolding>) {
    await db.stocks.update(id, { ...data, lastUpdated: new Date() })
    const idx = stocks.value.findIndex((s) => s.id === id)
    const item = idx !== -1 ? stocks.value[idx] : undefined
    if (item) Object.assign(item, data, { lastUpdated: new Date() })
  }

  async function deleteStock(id: string) {
    await db.stocks.delete(id)
    stocks.value = stocks.value.filter((s) => s.id !== id)
  }

  async function refreshStockPrices() {
    if (stocks.value.length === 0) return
    const tickers = stocks.value.map((s) => s.ticker)
    stockPrices.value = await fetchStockPrices(tickers)
  }

  // Export / Import backup
  async function exportBackup(): Promise<string> {
    const data = {
      version: 1,
      exportedAt: new Date().toISOString(),
      deposits: await db.deposits.toArray(),
      foreignDeposits: await db.foreignDeposits.toArray(),
      creditCards: await db.creditCards.toArray(),
      loans: await db.loans.toArray(),
      customAssets: await db.customAssets.toArray(),
      stocks: await db.stocks.toArray(),
    }
    return JSON.stringify(data, null, 2)
  }

  async function importBackup(json: string) {
    const data = JSON.parse(json)
    await db.transaction('rw', [db.deposits, db.foreignDeposits, db.creditCards, db.loans, db.customAssets, db.stocks], async () => {
      await db.deposits.clear()
      await db.foreignDeposits.clear()
      await db.creditCards.clear()
      await db.loans.clear()
      await db.customAssets.clear()
      await db.stocks.clear()

      if (data.deposits) await db.deposits.bulkAdd(data.deposits)
      if (data.foreignDeposits) await db.foreignDeposits.bulkAdd(data.foreignDeposits)
      if (data.creditCards) await db.creditCards.bulkAdd(data.creditCards)
      if (data.loans) await db.loans.bulkAdd(data.loans)
      if (data.customAssets) await db.customAssets.bulkAdd(data.customAssets)
      if (data.stocks) await db.stocks.bulkAdd(data.stocks)
    })
    await loadAll()
  }

  return {
    deposits,
    foreignDeposits,
    creditCards,
    loans,
    customAssets,
    stocks,
    stockPrices,
    loading,
    totalDeposits,
    totalForeignTWD,
    totalCustomAssets,
    totalStocks,
    totalAssets,
    totalCreditCardDebt,
    totalLoanBalance,
    totalCustomLiabilities,
    totalLiabilities,
    netWorth,
    loadAll,
    addDeposit,
    updateDeposit,
    deleteDeposit,
    addForeignDeposit,
    updateForeignDeposit,
    deleteForeignDeposit,
    addCreditCard,
    updateCreditCard,
    deleteCreditCard,
    addLoan,
    updateLoan,
    deleteLoan,
    addCustomAsset,
    updateCustomAsset,
    deleteCustomAsset,
    addStock,
    updateStock,
    deleteStock,
    refreshStockPrices,
    exportBackup,
    importBackup,
  }
})
