import { ref } from 'vue'
import { v4 as uuidv4 } from 'uuid'
import { useAssetStore } from '../stores/assets'
import { db } from '../db/database'
import { decrypt } from '../utils/crypto'
import { loadRates } from '../services/exchangeRate'
import type { DepositAccount, ForeignDeposit, CreditCard, Loan } from '../types'

// 爬蟲 JSON 的型別（對應 scrapers/src/types.ts）
interface SyncResult {
  syncedAt: string
  banks: BankScrapedData[]
}

interface BankScrapedData {
  bankId: string
  bankName: string
  scrapedAt: string
  success: boolean
  error?: string
  deposits: ScrapedDeposit[]
  foreignDeposits: ScrapedForeignDeposit[]
  creditCards: ScrapedCreditCard[]
  loans: ScrapedLoan[]
}

interface ScrapedDeposit {
  accountNumber: string
  balance: number
  currency: 'TWD'
  accountType: 'checking' | 'savings' | 'fixed'
  interestRate?: number
  nickname?: string
}

interface ScrapedForeignDeposit {
  accountNumber: string
  balance: number
  currency: string
  exchangeRate?: number
  nickname?: string
}

interface ScrapedCreditCard {
  cardNumber: string
  cardName: string
  creditLimit: number
  currentBalance: number
  minimumPayment: number
  dueDate?: string
  billingDate?: number
}

interface ScrapedLoan {
  loanType: 'mortgage' | 'personal' | 'car' | 'student' | 'other'
  principalAmount: number
  remainingBalance: number
  interestRate: number
  monthlyPayment: number
  startDate?: string
  maturityDate?: string
}

export const lastSyncedAt = ref<string | null>(null)
export const syncError = ref<string | null>(null)
export const syncing = ref(false)
export const triggeringScrape = ref(false)
export const scrapeStatus = ref<string | null>(null)
/** 交易所/銀行同步失敗的錯誤訊息，key = bankName */
export const bankErrors = ref<Record<string, string>>({})
/** 正在個別同步的目標 ID */
export const syncingTargets = ref<Set<string>>(new Set())

/** 所有可同步的目標清單 */
export const SYNC_TARGETS = [
  { id: 'esun', name: '玉山銀行', icon: '🏦' },
  { id: 'ctbc', name: '中國信託', icon: '🏦' },
  { id: 'feib', name: '遠東銀行', icon: '🏦' },
  { id: 'sinopac', name: '永豐銀行', icon: '🏦' },
  { id: 'linebank', name: 'LINE Bank', icon: '🏦' },
  { id: 'bingx', name: 'BingX', icon: '💰' },
  { id: 'binance', name: 'Binance', icon: '💰' },
  { id: 'bybit', name: 'Bybit', icon: '💰' },
] as const

/**
 * 從 /data/latest.json.enc 載入加密的爬蟲資料，解密後寫入 IndexedDB
 * 爬蟲資料的 source = 'scraper'，不會覆蓋手動輸入的資料
 */
/** 取得已儲存的密碼 */
export function getSyncPassword(): string | null {
  return localStorage.getItem('sync_password')
}

/** 儲存密碼 */
export function setSyncPassword(password: string) {
  localStorage.setItem('sync_password', password)
}

/** 清除密碼 */
export function clearSyncPassword() {
  localStorage.removeItem('sync_password')
}

export async function loadSyncData(): Promise<void> {
  syncing.value = true
  syncError.value = null

  try {
    let data: SyncResult = undefined!

    // 嘗試加密版本
    const encRes = await fetch('./data/latest.json.enc')
    if (encRes.ok) {
      const password = getSyncPassword()
      if (!password) {
        syncError.value = 'need_password'
        return
      }
      try {
        const encText = await encRes.text()
        const plaintext = await decrypt(encText, password)
        data = JSON.parse(plaintext)
      } catch {
        syncError.value = 'wrong_password'
        return
      }
    } else {
      // fallback 到明文（本地開發用）
      const res = await fetch('./data/latest.json')
      if (!res.ok) {
        if (res.status === 404) return
        throw new Error(`HTTP ${res.status}`)
      }
      data = await res.json()
    }

    lastSyncedAt.value = data.syncedAt

    // 記錄失敗的銀行/交易所
    const errors: Record<string, string> = {}
    for (const bank of data.banks) {
      if (!bank.success && bank.error) {
        errors[bank.bankName] = bank.error
      }
    }
    bankErrors.value = errors

    // 取得即時匯率
    const rates = await loadRates()

    // 清除舊的爬蟲資料（保留手動資料）
    await db.transaction('rw', [db.deposits, db.foreignDeposits, db.creditCards, db.loans], async () => {
      await db.deposits.where('source').equals('scraper').delete()
      await db.foreignDeposits.where('source').equals('scraper').delete()
      await db.creditCards.where('source').equals('scraper').delete()
      await db.loans.where('source').equals('scraper').delete()

      // 寫入新的爬蟲資料
      for (const bank of data.banks) {
        if (!bank.success) continue
        const scrapedAt = new Date(bank.scrapedAt)

        // 台幣存款
        const deposits: DepositAccount[] = bank.deposits.map((d) => ({
          id: uuidv4(),
          type: 'deposit' as const,
          bankName: bank.bankName,
          accountNumber: d.accountNumber,
          balance: d.balance,
          currency: 'TWD' as const,
          accountType: d.accountType,
          interestRate: d.interestRate,
          nickname: d.nickname,
          lastUpdated: scrapedAt,
          source: 'scraper' as const,
        }))
        if (deposits.length) await db.deposits.bulkAdd(deposits)

        // 外幣存款
        const fds: ForeignDeposit[] = bank.foreignDeposits.map((f) => {
          const rate = f.exchangeRate ?? rates[f.currency] ?? 0
          return {
          id: uuidv4(),
          type: 'foreign_deposit' as const,
          bankName: bank.bankName,
          accountNumber: f.accountNumber,
          balance: f.balance,
          currency: f.currency,
          exchangeRate: rate,
          twdEquivalent: f.balance * rate,
          nickname: f.nickname,
          lastUpdated: scrapedAt,
          source: 'scraper' as const,
        }})
        if (fds.length) await db.foreignDeposits.bulkAdd(fds)

        // 信用卡
        const cards: CreditCard[] = bank.creditCards.map((c) => ({
          id: uuidv4(),
          type: 'credit_card' as const,
          bankName: bank.bankName,
          cardNumber: c.cardNumber,
          cardName: c.cardName,
          creditLimit: c.creditLimit,
          currentBalance: c.currentBalance,
          minimumPayment: c.minimumPayment,
          dueDate: c.dueDate ? new Date(c.dueDate) : new Date(),
          billingDate: c.billingDate ?? 1,
          currency: 'TWD' as const,
          lastUpdated: scrapedAt,
          source: 'scraper' as const,
        }))
        if (cards.length) await db.creditCards.bulkAdd(cards)

        // 貸款
        const loans: Loan[] = bank.loans.map((l) => ({
          id: uuidv4(),
          type: 'loan' as const,
          bankName: bank.bankName,
          loanType: l.loanType,
          principalAmount: l.principalAmount,
          remainingBalance: l.remainingBalance,
          interestRate: l.interestRate,
          monthlyPayment: l.monthlyPayment,
          startDate: l.startDate ? new Date(l.startDate) : new Date(),
          maturityDate: l.maturityDate ? new Date(l.maturityDate) : new Date(),
          currency: 'TWD' as const,
          lastUpdated: scrapedAt,
          source: 'scraper' as const,
        }))
        if (loans.length) await db.loans.bulkAdd(loans)
      }
    })

    // 重新載入 store
    const store = useAssetStore()
    await store.loadAll()
  } catch (e) {
    syncError.value = e instanceof Error ? e.message : String(e)
  } finally {
    syncing.value = false
  }
}

const REPO = 'rubiktwjack/bank-sync'
const WORKFLOW_FILE = 'scrape.yml'

/**
 * 手動觸發 GitHub Actions 爬蟲 workflow
 * @param targets 要同步的目標 ID，不傳則全部
 */
export async function triggerSync(targets?: string[]): Promise<void> {
  const pat = import.meta.env.VITE_GH_PAT as string
  if (!pat) {
    scrapeStatus.value = '未設定 GitHub PAT，無法觸發同步'
    return
  }

  const targetsStr = targets?.join(',') ?? ''
  const targetNames = targets
    ? targets.map(id => SYNC_TARGETS.find(t => t.id === id)?.name ?? id).join('、')
    : '全部'

  // 標記正在同步的目標
  if (targets) {
    for (const t of targets) syncingTargets.value.add(t)
  }

  triggeringScrape.value = true
  scrapeStatus.value = `正在觸發：${targetNames}...`

  try {
    const headers = {
      Authorization: `Bearer ${pat}`,
      Accept: 'application/vnd.github.v3+json',
    }

    // 觸發 workflow
    const body: Record<string, unknown> = { ref: 'main' }
    if (targetsStr) {
      body.inputs = { targets: targetsStr }
    }

    const triggerRes = await fetch(
      `https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW_FILE}/dispatches`,
      {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
    )

    if (!triggerRes.ok) {
      throw new Error(`觸發失敗: HTTP ${triggerRes.status}`)
    }

    scrapeStatus.value = `已觸發 ${targetNames}，等待執行...`

    // 等一下讓 GitHub 建立 run
    await sleep(5000)

    // Poll workflow run 狀態（每 15 秒，最多 10 分鐘）
    const maxAttempts = 40
    for (let i = 0; i < maxAttempts; i++) {
      const runsRes = await fetch(
        `https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW_FILE}/runs?per_page=1`,
        { headers },
      )
      if (!runsRes.ok) break

      const runsData = await runsRes.json()
      const run = runsData.workflow_runs?.[0]
      if (!run) break

      if (run.status === 'completed') {
        if (run.conclusion === 'success') {
          scrapeStatus.value = `${targetNames} 完成，等待部署...`
          // 等 deploy workflow 完成
          await sleep(60000)
          scrapeStatus.value = '重新載入資料...'
          await loadSyncData()
          scrapeStatus.value = '同步完成！'
          setTimeout(() => { scrapeStatus.value = null }, 3000)
          return
        } else {
          throw new Error(`爬蟲失敗: ${run.conclusion}`)
        }
      }

      scrapeStatus.value = `同步中：${targetNames} (${i + 1}/${maxAttempts})`
      await sleep(15000)
    }

    scrapeStatus.value = '等待逾時，請稍後手動重整'
  } catch (e) {
    scrapeStatus.value = e instanceof Error ? e.message : String(e)
  } finally {
    triggeringScrape.value = false
    if (targets) {
      for (const t of targets) syncingTargets.value.delete(t)
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
