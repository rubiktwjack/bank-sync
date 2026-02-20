// ─── 爬蟲輸出的標準資料格式 ───
// 每家銀行爬蟲都必須輸出這些格式，前端直接讀取

export interface ScrapedDeposit {
  accountNumber: string
  balance: number
  currency: 'TWD'
  accountType: 'checking' | 'savings' | 'fixed'
  interestRate?: number
  nickname?: string
}

export interface ScrapedForeignDeposit {
  accountNumber: string
  balance: number
  currency: string
  exchangeRate?: number
  nickname?: string
}

export interface ScrapedCreditCard {
  cardNumber: string
  cardName: string
  creditLimit: number
  currentBalance: number
  minimumPayment: number
  dueDate?: string       // ISO date string
  billingDate?: number   // day of month
}

export interface ScrapedLoan {
  loanType: 'mortgage' | 'personal' | 'car' | 'student' | 'other'
  principalAmount: number
  remainingBalance: number
  interestRate: number
  monthlyPayment: number
  startDate?: string     // ISO date string
  maturityDate?: string  // ISO date string
}

// 單一銀行爬蟲的完整輸出
export interface BankScrapedData {
  bankId: string
  bankName: string
  scrapedAt: string  // ISO datetime
  success: boolean
  error?: string
  deposits: ScrapedDeposit[]
  foreignDeposits: ScrapedForeignDeposit[]
  creditCards: ScrapedCreditCard[]
  loans: ScrapedLoan[]
}

// 所有銀行匯總的輸出（寫入 data/latest.json）
export interface SyncResult {
  syncedAt: string  // ISO datetime
  banks: BankScrapedData[]
}

// ─── 銀行爬蟲設定 ───

export interface BankCredentials {
  username: string
  password: string
  // 某些銀行需要額外欄位（如身分證字號）
  extra?: Record<string, string>
}

export interface BankConfig {
  bankId: string
  enabled: boolean
  credentials: BankCredentials
}

export interface ScraperConfig {
  banks: BankConfig[]
  headless: boolean
  timeout: number       // 每家銀行的超時時間 (ms)
  retries: number       // 失敗重試次數
  outputPath: string    // 輸出 JSON 的路徑
}
