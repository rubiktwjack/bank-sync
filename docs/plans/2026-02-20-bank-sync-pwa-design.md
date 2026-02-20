# Bank Sync PWA — Brainstorming Design Document

> Date: 2026-02-20
> Status: Draft — Approved Direction (Vue + Mobile-Only)

---

## 1. Purpose & Vision

建立一個**純前端 PWA 資產管理應用**，讓台灣用戶可以集中管理所有銀行帳戶的資產狀況，包括台幣存款、外幣存款、信用卡、貸款，以及自訂資產項目。

### 核心價值
- **全覽式資產儀表板**：一眼看清所有資產與負債
- **無後端架構**：資料完全存在用戶裝置，保障隱私
- **離線可用**：PWA 架構，安裝後可離線使用
- **彈性擴充**：支援自訂資產，應對無法自動抓取的情況

### 成功標準
- 用戶能在 Dashboard 看到所有資產的即時概覽
- 支援至少 5 大主要銀行的資料格式
- 可離線使用，資料持久化
- 自訂資產功能覆蓋任何無法自動同步的資產

---

## 2. 約束條件

| 約束 | 說明 |
|------|------|
| **無後端** | 所有邏輯在客戶端執行，無伺服器 |
| **銀行無 API** | 台灣的銀行不提供公開 API，需要替代方案取得資料 |
| **CORS 限制** | 瀏覽器無法直接 fetch 銀行網站 |
| **隱私優先** | 銀行憑證和財務資料不應離開用戶裝置 |
| **PWA** | 必須可安裝、離線可用 |

---

## 3. 資料來源策略 — 三種方案比較

### 方案 A：瀏覽器擴充套件（推薦）

```
[銀行網站] → [Chrome Extension Content Script] → [Extract Data] → [PWA IndexedDB]
```

**優點：**
- 直接在銀行網頁環境中執行，無 CORS 問題
- 用戶登入銀行後，擴充套件自動辨識頁面並提取資料
- 體驗最流暢，接近自動同步

**缺點：**
- 需要開發和維護 Chrome Extension
- 銀行網站改版時需要更新 parser
- 初期開發量較大

**架構：**
- Extension 使用 Content Script 注入銀行頁面
- 辨識頁面類型（帳戶總覽、交易明細、信用卡帳單等）
- 提取結構化資料後透過 `chrome.runtime.sendMessage` 或 `BroadcastChannel` 傳給 PWA
- PWA 接收後寫入 IndexedDB

### 方案 B：手動匯入（最簡單）

```
[銀行網站] → [用戶手動下載 CSV/Excel] → [PWA 解析並匯入]
```

**優點：**
- 實作最簡單
- 不需要額外安裝擴充套件
- 不受銀行網站改版影響（只要匯出格式不變）

**缺點：**
- 需要用戶手動操作
- 各銀行匯出格式不同，需要逐一適配
- 體驗不夠流暢

### 方案 C：混合模式（推薦的漸進策略）

```
Phase 1: 手動匯入 + 自訂資產 → 先讓 app 可用
Phase 2: 加入 Chrome Extension → 提升自動化
Phase 3: 支援更多銀行 → 逐步擴充 parser
```

**推薦原因：**
- 先用最小可行產品驗證需求
- 自訂資產功能可以 cover 所有場景
- Extension 作為增強功能逐步加入
- 降低初期開發風險

---

## 4. 技術架構

### 4.1 Tech Stack

| 層級 | 技術選擇 | 理由 |
|------|----------|------|
| **Framework** | Vue 3 + TypeScript | 用戶偏好，Composition API 簡潔 |
| **Build Tool** | Vite 6 | 快速建置，原生 PWA 插件 |
| **PWA** | vite-plugin-pwa | Service Worker 自動生成，離線支援 |
| **Styling** | Tailwind CSS 4 | 快速開發 mobile UI，原子化 CSS |
| **Local DB** | Dexie.js (IndexedDB) | 型別安全的 IndexedDB 封裝，支援複雜查詢 |
| **Charts** | Chart.js + vue-chartjs | 輕量、框架無關，Vue 封裝完善 |
| **Routing** | Vue Router 4 | Vue 官方路由 |
| **State** | Pinia | Vue 官方狀態管理，TypeScript 友善 |
| **i18n** | 預設中文 | 目標用戶為台灣用戶 |
| **Icons** | Lucide Vue Next | 輕量、一致的圖示庫 |
| **目標裝置** | 手機優先（Mobile-Only） | 用戶主要在手機上使用 |

### 4.2 專案結構

```
bank-sync/
├── public/
│   ├── icons/                 # App icons (各尺寸)
│   └── favicon.ico
├── src/
│   ├── main.ts                # Entry point
│   ├── App.vue                # Root component
│   ├── components/
│   │   ├── layout/
│   │   │   ├── BottomNav.vue  # 底部 Tab 導航
│   │   │   ├── TopBar.vue     # 頂部列（標題 + 動作按鈕）
│   │   │   └── AppLayout.vue  # 主要版面
│   │   ├── dashboard/
│   │   │   ├── AssetSummary.vue      # 資產總覽卡片
│   │   │   ├── NetWorthCard.vue      # 淨值卡片
│   │   │   ├── AssetDistribution.vue # 資產分佈圖
│   │   │   └── RecentActivity.vue    # 近期活動
│   │   ├── accounts/
│   │   │   ├── DepositCard.vue       # 台幣存款卡片
│   │   │   ├── ForeignDepositCard.vue# 外幣存款卡片
│   │   │   ├── CreditCardCard.vue    # 信用卡卡片
│   │   │   └── LoanCard.vue          # 貸款卡片
│   │   ├── custom-assets/
│   │   │   ├── CustomAssetForm.vue   # 自訂資產表單
│   │   │   └── CustomAssetList.vue   # 自訂資產列表
│   │   └── import/
│   │       ├── FileImport.vue        # 檔案匯入元件
│   │       └── ManualEntry.vue       # 手動輸入元件
│   ├── db/
│   │   ├── schema.ts          # Dexie schema 定義
│   │   ├── database.ts        # DB 實例
│   │   └── migrations.ts      # 版本遷移
│   ├── stores/
│   │   ├── assets.ts          # 資產狀態 (Pinia)
│   │   └── settings.ts        # 設定狀態 (Pinia)
│   ├── composables/
│   │   ├── useAccounts.ts     # 帳戶資料 composable
│   │   ├── useCurrency.ts     # 匯率 composable
│   │   └── useNetWorth.ts     # 淨值計算 composable
│   ├── parsers/
│   │   ├── types.ts           # Parser 共用型別
│   │   ├── cathay.ts          # 國泰世華 parser
│   │   ├── ctbc.ts            # 中信 parser
│   │   ├── esun.ts            # 玉山 parser
│   │   ├── fubon.ts           # 富邦 parser
│   │   └── taishin.ts         # 台新 parser
│   ├── pages/
│   │   ├── DashboardPage.vue  # 儀表板頁面
│   │   ├── AssetsPage.vue     # 資產總覽頁面（存款+外幣+自訂）
│   │   ├── LiabilitiesPage.vue# 負債頁面（信用卡+貸款）
│   │   ├── ImportPage.vue     # 匯入頁面
│   │   └── SettingsPage.vue   # 設定頁面
│   ├── types/
│   │   └── index.ts           # 共用型別定義
│   └── utils/
│       ├── currency.ts        # 幣別轉換工具
│       ├── format.ts          # 數字/日期格式化
│       └── export.ts          # 資料匯出工具
├── docs/
│   └── plans/
├── index.html
├── package.json
├── tsconfig.json
├── tailwind.config.ts
└── vite.config.ts
```

---

## 5. 資料模型

### 5.1 核心型別

```typescript
// 基礎資產介面
interface BaseAsset {
  id: string;
  bankName: string;
  nickname?: string;        // 用戶自訂名稱
  lastUpdated: Date;
  source: 'manual' | 'import' | 'extension';
}

// 台幣存款
interface DepositAccount extends BaseAsset {
  type: 'deposit';
  accountNumber: string;    // 遮蔽顯示
  balance: number;
  currency: 'TWD';
  accountType: 'checking' | 'savings' | 'fixed'; // 活存/活儲/定存
  interestRate?: number;
}

// 外幣存款
interface ForeignDeposit extends BaseAsset {
  type: 'foreign_deposit';
  accountNumber: string;
  balance: number;
  currency: string;         // USD, JPY, EUR, CNY, etc.
  twdEquivalent: number;    // 換算台幣金額
  exchangeRate: number;     // 記錄時的匯率
}

// 信用卡
interface CreditCard extends BaseAsset {
  type: 'credit_card';
  cardNumber: string;       // 僅後四碼
  cardName: string;         // 卡片名稱（如：御璽卡）
  creditLimit: number;
  currentBalance: number;   // 本期應繳
  minimumPayment: number;   // 最低應繳
  dueDate: Date;            // 繳款截止日
  billingDate: number;      // 結帳日（每月幾號）
  currency: 'TWD';
}

// 貸款
interface Loan extends BaseAsset {
  type: 'loan';
  loanType: 'mortgage' | 'personal' | 'car' | 'student' | 'other';
  principalAmount: number;  // 貸款總額
  remainingBalance: number; // 剩餘本金
  interestRate: number;     // 年利率 %
  monthlyPayment: number;   // 每月還款金額
  startDate: Date;
  maturityDate: Date;       // 到期日
  currency: 'TWD';
}

// 自訂資產
interface CustomAsset {
  id: string;
  name: string;
  category: 'asset' | 'liability';
  subCategory: string;      // 用戶自訂分類（如：股票、基金、不動產）
  value: number;
  currency: string;
  notes?: string;
  lastUpdated: Date;
}

// 匯率資料
interface ExchangeRate {
  currency: string;
  rate: number;             // 對 TWD 匯率
  updatedAt: Date;
}
```

### 5.2 IndexedDB Schema (Dexie.js)

```typescript
class BankSyncDB extends Dexie {
  deposits!: Table<DepositAccount>;
  foreignDeposits!: Table<ForeignDeposit>;
  creditCards!: Table<CreditCard>;
  loans!: Table<Loan>;
  customAssets!: Table<CustomAsset>;
  exchangeRates!: Table<ExchangeRate>;
  snapshots!: Table<NetWorthSnapshot>; // 淨值歷史紀錄

  constructor() {
    super('BankSyncDB');
    this.version(1).stores({
      deposits: 'id, bankName, accountType',
      foreignDeposits: 'id, bankName, currency',
      creditCards: 'id, bankName, dueDate',
      loans: 'id, bankName, loanType',
      customAssets: 'id, category, subCategory',
      exchangeRates: 'currency',
      snapshots: 'id, date',
    });
  }
}
```

---

## 6. UI 設計（Mobile-Only）

### 6.1 頁面結構

手機優先設計，底部 Tab 導航，無側邊欄：

```
┌─────────────────────────┐
│  Bank Sync        ⚙️     │  ← TopBar
├─────────────────────────┤
│                         │
│  ┌───────────────────┐  │
│  │  淨值              │  │
│  │  NT$ 2,350,000    │  │
│  │  ▲ +12,500 本月   │  │
│  └───────────────────┘  │
│                         │
│  ┌────────┐ ┌────────┐  │
│  │ 總資產  │ │ 總負債  │  │
│  │ 8.2M   │ │ 5.8M   │  │
│  └────────┘ └────────┘  │
│                         │
│  ┌───────────────────┐  │
│  │  資產分佈圓餅圖     │  │
│  └───────────────────┘  │
│                         │
│  ┌───────────────────┐  │
│  │ 玉山 活儲 ****1234 │  │
│  │ NT$ 152,380       │  │
│  └───────────────────┘  │
│  ┌───────────────────┐  │
│  │ 中信 Line Pay 卡   │  │
│  │ 應繳 NT$ 12,500   │  │
│  └───────────────────┘  │
│                         │
├─────────────────────────┤
│ 總覽 │ 資產 │ 負債 │ 更多 │  ← BottomNav (4 tabs)
└─────────────────────────┘
```

**底部 Tab 設計（4 個 Tab）：**
- **總覽**：Dashboard 淨值 + 資產分佈 + 快速概覽
- **資產**：台幣存款 + 外幣存款 + 自訂資產
- **負債**：信用卡 + 貸款
- **更多**：匯入/匯出、設定、備份

### 6.2 色彩方案

```
主色調:
  - Primary:    #6366F1 (Indigo-500) — 主要操作按鈕
  - Secondary:  #8B5CF6 (Violet-500) — 輔助色

資產相關:
  - Asset:      #10B981 (Emerald-500) — 資產（正值）
  - Liability:  #EF4444 (Red-500)    — 負債（負值）

背景:
  - Background: #F8FAFC (Slate-50)   — 頁面背景
  - Card:       #FFFFFF              — 卡片白底

支援 Dark Mode（Phase 2）:
  - Bg Dark:    #0F172A (Slate-900)
  - Card Dark:  #1E293B (Slate-800)
```

### 6.3 各資產卡片設計

**台幣存款卡片：**
```
┌──────────────────────────┐
│  🏦 玉山銀行              │
│  活期儲蓄 ****1234        │
│                          │
│  NT$ 152,380             │
│  ──────────────────      │
│  利率 0.84%  │  更新 2h前 │
└──────────────────────────┘
```

**信用卡卡片：**
```
┌──────────────────────────┐
│  💳 中信 Line Pay 卡      │
│  ****5678                │
│                          │
│  本期應繳  NT$ 12,500     │
│  最低應繳  NT$ 1,250      │
│  ──────────────────      │
│  繳款日 3/15  │  額度 30萬 │
└──────────────────────────┘
```

**貸款卡片：**
```
┌──────────────────────────┐
│  🏠 國泰世華 — 房貸       │
│                          │
│  剩餘本金  NT$ 5,200,000  │
│  ████████░░ 65%          │
│  ──────────────────      │
│  月付 $22,500 │ 利率 2.1% │
│  到期 2045/06             │
└──────────────────────────┘
```

---

## 7. 功能規格

### 7.1 核心功能（Phase 1 — MVP）

| # | 功能 | 說明 |
|---|------|------|
| F1 | Dashboard 總覽 | 顯示總資產、總負債、淨值，資產分佈圖 |
| F2 | 台幣存款管理 | 新增/編輯/刪除台幣存款帳戶 |
| F3 | 外幣存款管理 | 多幣別存款，自動換算台幣等值 |
| F4 | 信用卡管理 | 追蹤應繳金額、繳款日、額度使用率 |
| F5 | 貸款管理 | 追蹤剩餘本金、還款進度 |
| F6 | 自訂資產/負債 | 自由新增任何資產或負債項目 |
| F7 | 手動資料輸入 | 表單方式手動輸入帳戶資料 |
| F8 | CSV/Excel 匯入 | 解析銀行匯出的檔案 |
| F9 | 資料匯出/備份 | 匯出 JSON 備份檔 |
| F10 | PWA 安裝 | 可安裝到手機，離線可用 |
| F11 | Mobile-Only 設計 | 專為手機螢幕最佳化，底部 Tab 導航 |

### 7.2 增強功能（Phase 2）

| # | 功能 | 說明 |
|---|------|------|
| F12 | Chrome Extension | 自動從銀行網頁抓取資料 |
| F13 | 淨值趨勢圖 | 歷史淨值變化折線圖 |
| F14 | 即時匯率 | 串接公開匯率 API 更新外幣匯率 |
| F15 | 繳款提醒 | 信用卡繳款日通知 |
| F16 | Dark Mode | 深色模式支援 |

### 7.3 未來考慮（Phase 3）

| # | 功能 | 說明 |
|---|------|------|
| F17 | 多裝置同步 | 透過 WebRTC 或雲端同步 |
| F18 | 支出分析 | 信用卡消費分類分析 |
| F19 | 預算規劃 | 月度預算設定與追蹤 |

---

## 8. 匯入解析器設計

### 支援銀行（Phase 1 目標）

| 銀行 | 匯出格式 | Parser ID |
|------|----------|-----------|
| 國泰世華 | CSV | `cathay` |
| 中國信託 | CSV/Excel | `ctbc` |
| 玉山銀行 | CSV | `esun` |
| 富邦銀行 | CSV | `fubon` |
| 台新銀行 | CSV/Excel | `taishin` |

### Parser 介面

```typescript
interface BankParser {
  bankId: string;
  bankName: string;
  supportedFormats: ('csv' | 'xlsx' | 'txt')[];

  // 偵測檔案是否屬於此銀行
  detect(content: string): boolean;

  // 解析檔案內容
  parse(content: string): ParseResult;
}

interface ParseResult {
  deposits?: DepositAccount[];
  foreignDeposits?: ForeignDeposit[];
  creditCards?: CreditCard[];
  loans?: Loan[];
  errors?: ParseError[];
}
```

---

## 9. 安全性考量

| 項目 | 措施 |
|------|------|
| **資料儲存** | 所有資料僅存在 IndexedDB，不離開裝置 |
| **帳號遮蔽** | 帳號/卡號僅顯示後四碼 |
| **無網路傳輸** | 不傳送任何財務資料到外部伺服器 |
| **匯出加密** | 備份檔可選擇密碼加密（Phase 2） |
| **CSP** | 嚴格的 Content Security Policy |

---

## 10. 開發階段規劃

### Phase 1：MVP（核心功能）
1. 專案初始化（Vite + Vue 3 + TypeScript + Tailwind + PWA）
2. 資料模型和 IndexedDB 設定（Dexie.js）
3. Mobile Layout 框架（底部 Tab + 頂部列）
4. Dashboard 總覽頁面
5. 各資產類別 CRUD 頁面
6. 自訂資產功能
7. 手動資料輸入表單
8. CSV 匯入基礎功能
9. 資料匯出/備份
10. PWA 設定和離線支援

### Phase 2：增強功能
12. Chrome Extension 開發
13. 更多銀行 Parser
14. 淨值趨勢圖
15. 匯率 API 整合
16. Dark Mode
17. 繳款提醒通知

---

## 11. 決策記錄

| 決策 | 選擇 | 理由 |
|------|------|------|
| Framework | Vue 3 + Vite | 用戶偏好，Composition API 簡潔 |
| 狀態管理 | Pinia | Vue 官方推薦，TypeScript 友善 |
| 本地資料庫 | Dexie.js | IndexedDB 最佳封裝，型別安全 |
| CSS | Tailwind | 快速開發 mobile UI，utility-first |
| 資料來源策略 | 混合模式 | 先手動匯入，後續加入 Extension |
| 圖表 | Chart.js + vue-chartjs | 輕量、Vue 封裝完善 |
| 設計方向 | Mobile-Only | 用戶只需手機使用，底部 Tab 導航 |

---

## 12. 市場研究與驗證

### 12.1 台灣 Open Banking 現狀

台灣金管會推動 Open Banking 三階段：
- **Phase 1**（產品資訊）：已上線
- **Phase 2**（客戶資料查詢）：已上線，但僅剩 TDCC（集保結算所）一家 TSP 營運
- **Phase 3**（交易功能）：2024 年才開放申請

**結論**：台灣目前**沒有可用的 Open Banking API 生態系統**來存取個人銀行資料。Web scraping / 手動匯入是現階段唯一可行的方案。

### 12.2 既有開源專案分析

**台灣銀行相關開源專案**：目前沒有任何開源專案做台灣銀行的個人帳戶/交易資料抓取。既有專案都僅限於**匯率**爬取：
- `bot_exrate_parser` — 台灣銀行匯率爬蟲（Go）
- `bank_of_taiwan_exchange_rate_crawler` — 台銀匯率爬蟲
- `FinMind` — 台灣金融市場資料（股票、基本面）

**最佳參考架構**：[israeli-bank-scrapers](https://github.com/eshaham/israeli-bank-scrapers)
- Node.js + Puppeteer 架構
- `BaseScraper` → `BaseScraperWithBrowser` → 各銀行 Scraper 的類別繼承
- 標準化輸出格式：`{ success, accounts: [{ accountNumber, txns }] }`
- 已建立完整生態系（Moneyman、Firefly III importer、Actual Budget importer）

### 12.3 競品分析

| 專案 | 多幣別 | PWA | 純前端 | 台灣銀行 |
|------|--------|-----|--------|----------|
| Ghostfolio | Yes | Yes | No (需 NestJS+PostgreSQL) | No |
| Firefly III | Yes | No | No (PHP+Server) | No |
| Actual Budget | 有限 | 部分 | 部分 (SQLite) | No |
| Maybe Finance | Yes | No | No (Rails) | No |
| **Bank Sync (本專案)** | **Yes** | **Yes** | **Yes** | **Yes** |

**市場缺口確認**：目前沒有任何開源專案同時滿足 PWA + 純前端 + 多幣別 + 台灣銀行整合。本專案填補了一個真實的需求缺口。

### 12.4 Dexie.js 選擇驗證

| IndexedDB 封裝庫 | 週下載量 | 大小 | 加密 | 適用場景 |
|-----------------|---------|------|------|---------|
| **Dexie.js** | ~727K | ~29KB gzipped | 手動 | 簡單易用，WhatsApp Web/GitHub Desktop 在用 |
| RxDB | ~65K | 模組化 | 內建 (Web Crypto) | 需加密和 schema 驗證的場景 |
| PouchDB | ~60K | ~46KB gzipped | 手動 | 需要 CouchDB 同步 |

Dexie.js 為最佳選擇：最大社群、最輕量、型別安全。如未來需要加密，可搭配 Web Crypto API (AES-GCM + PBKDF2) 實作。

---

## User Feedback (2026-02-20)

- **Framework**: Vue 3（用戶選擇）
- **功能範圍**: 無調整
- **UI 設計**: 需要先看到再調整
- **整體方向**: 手機優先，不需要桌機版或原生 app
- **策略**: 先做出來，邊看邊調

---

## 13. 架構變更：GitHub Actions 爬蟲 + GitHub Pages（2026-02-20）

### 13.1 變更原因

用戶需求澄清：
- **不堅持 PWA**，但仍不要後端（不想建 server）
- 需要**網路爬蟲自動抓取銀行資料**，帳密 hardcode
- 手機上要能看到同步結果

### 13.2 新架構

```
GitHub Actions (定時 cron)
  └── Playwright 爬蟲
      ├── 國泰世華 Scraper
      ├── 中國信託 Scraper
      ├── 玉山銀行 Scraper
      ├── 台北富邦 Scraper
      └── 台新銀行 Scraper
          │
          ▼
      data/latest.json (commit 到 repo)
          │
          ▼
GitHub Pages (靜態前端)
  └── Vue 3 App 讀取 data/latest.json
          │
          ▼
      手機瀏覽器打開即可查看
```

### 13.3 爬蟲插件架構

```
scrapers/
├── package.json              # Node.js 獨立套件
├── tsconfig.json
├── src/
│   ├── types.ts              # 爬蟲輸出標準格式
│   ├── base-scraper.ts       # 基底類別（登入、爬取流程）
│   ├── runner.ts             # 主程式（讀取設定、執行爬蟲、輸出 JSON）
│   ├── banks/
│   │   ├── index.ts          # 銀行註冊表
│   │   ├── cathay.ts         # 國泰世華
│   │   ├── ctbc.ts           # 中國信託
│   │   ├── esun.ts           # 玉山銀行
│   │   ├── fubon.ts          # 台北富邦
│   │   └── taishin.ts        # 台新銀行
│   └── utils/
│       ├── logger.ts         # 日誌
│       └── retry.ts          # 重試機制
```

**新增銀行步驟：**
1. 在 `scrapers/src/banks/` 新建 `xxx.ts`，繼承 `BaseScraper`
2. 實作 `login()` 和需要的 `scrapeXxx()` 方法
3. 在 `banks/index.ts` 註冊
4. 在 GitHub Secrets 加入帳密環境變數

### 13.4 帳密管理

帳密存在 **GitHub Secrets**，不進入 code：

```
BANK_XXX_ENABLED=true
BANK_XXX_USERNAME=<your-username>
BANK_XXX_PASSWORD=<your-password>
BANK_XXX_EXTRA_FIELD=<value>
```

### 13.5 前端資料流

1. GitHub Actions 每天定時跑爬蟲
2. 爬完的 JSON commit 到 `data/latest.json`
3. GitHub Pages 自動重新部署
4. 前端 `loadSyncData()` 從 `./data/latest.json` fetch 資料
5. 爬蟲資料 (source='scraper') 寫入 IndexedDB，不覆蓋手動資料 (source='manual')
6. 手機打開 GitHub Pages URL 即可看到最新資料

### 13.6 決策更新

| 決策 | 選擇 | 理由 |
|------|------|------|
| 資料來源 | GitHub Actions + Playwright 爬蟲 | 無需 server、全自動、帳密安全存放 |
| 部署方式 | GitHub Pages | 免費、自動部署、手機可開 |
| 爬蟲框架 | Playwright | 比 Puppeteer 更穩定，API 更好用 |
| 帳密儲存 | GitHub Secrets → 環境變數 | 加密存放，不進 code |
