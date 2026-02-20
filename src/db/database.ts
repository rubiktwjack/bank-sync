import Dexie, { type Table } from 'dexie'
import type {
  DepositAccount,
  ForeignDeposit,
  CreditCard,
  Loan,
  CustomAsset,
  ExchangeRate,
  NetWorthSnapshot,
} from '../types'

export class BankSyncDB extends Dexie {
  deposits!: Table<DepositAccount>
  foreignDeposits!: Table<ForeignDeposit>
  creditCards!: Table<CreditCard>
  loans!: Table<Loan>
  customAssets!: Table<CustomAsset>
  exchangeRates!: Table<ExchangeRate>
  snapshots!: Table<NetWorthSnapshot>

  constructor() {
    super('BankSyncDB')
    this.version(1).stores({
      deposits: 'id, bankName, accountType',
      foreignDeposits: 'id, bankName, currency',
      creditCards: 'id, bankName, dueDate',
      loans: 'id, bankName, loanType',
      customAssets: 'id, category, subCategory',
      exchangeRates: 'currency',
      snapshots: 'id, date',
    })

    // v2: 加入 source 索引，支援按來源篩選（爬蟲 vs 手動）
    this.version(2).stores({
      deposits: 'id, bankName, accountType, source',
      foreignDeposits: 'id, bankName, currency, source',
      creditCards: 'id, bankName, dueDate, source',
      loans: 'id, bankName, loanType, source',
      customAssets: 'id, category, subCategory',
      exchangeRates: 'currency',
      snapshots: 'id, date',
    })
  }
}

export const db = new BankSyncDB()
