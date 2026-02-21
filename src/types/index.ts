export interface BaseAsset {
  id: string
  bankName: string
  nickname?: string
  lastUpdated: Date
  source: 'manual' | 'import' | 'extension' | 'scraper'
}

export interface DepositAccount extends BaseAsset {
  type: 'deposit'
  accountNumber: string
  balance: number
  currency: 'TWD'
  accountType: 'checking' | 'savings' | 'fixed'
  interestRate?: number
}

export interface ForeignDeposit extends BaseAsset {
  type: 'foreign_deposit'
  accountNumber: string
  balance: number
  currency: string
  twdEquivalent: number
  exchangeRate: number
}

export interface CreditCard extends BaseAsset {
  type: 'credit_card'
  cardNumber: string
  cardName: string
  creditLimit: number
  currentBalance: number
  minimumPayment: number
  dueDate: Date
  billingDate: number
  currency: 'TWD'
}

export interface Loan extends BaseAsset {
  type: 'loan'
  loanType: 'mortgage' | 'personal' | 'car' | 'student' | 'other'
  principalAmount: number
  remainingBalance: number
  interestRate: number
  monthlyPayment: number
  startDate: Date
  maturityDate: Date
  currency: 'TWD'
}

export interface CustomAsset {
  id: string
  name: string
  category: 'asset' | 'liability'
  subCategory: string
  value: number
  currency: string
  notes?: string
  lastUpdated: Date
}

export interface ExchangeRate {
  currency: string
  rate: number
  updatedAt: Date
}

export interface NetWorthSnapshot {
  id: string
  date: Date
  totalAssets: number
  totalLiabilities: number
  netWorth: number
}

export interface StockHolding {
  id: string
  ticker: string        // 2330.TW, AAPL
  name?: string         // 台積電, Apple
  shares: number
  avgCost?: number      // 選填：平均成本
  lastUpdated: Date
}

export type AssetType = DepositAccount | ForeignDeposit | CreditCard | Loan | CustomAsset
