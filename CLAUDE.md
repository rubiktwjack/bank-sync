# Rex 資產總覽 - 台灣個人財務管理 PWA

## 專案概述

隱私優先的 PWA，聚合台灣各銀行帳戶資料（存款、外幣、信用卡）、股票持倉、加密貨幣到統一儀表板。所有資料存在本地 IndexedDB，無後端伺服器。爬蟲資料加密後部署至 GitHub Pages。

## 技術棧

- **前端**: Vue 3 + TypeScript + Tailwind CSS + Vite + Pinia + Dexie.js (IndexedDB)
- **Scraper**: Node.js + Playwright
- **PWA**: vite-plugin-pwa
- **CI/CD**: GitHub Actions（爬蟲排程 + GitHub Pages 部署）
- **加密**: AES-256-GCM（PBKDF2 從密碼導出金鑰，Node.js crypto + Web Crypto API）

## 專案結構

```
bank-sync/
├── src/                    # Vue 前端應用
│   ├── pages/              # 頁面: Dashboard, Assets, Liabilities, More
│   ├── components/         # UI 元件
│   ├── stores/assets.ts    # Pinia store (所有資產/負債/股票 CRUD)
│   ├── composables/useSync.ts  # 載入加密 JSON + 手動觸發同步
│   ├── services/
│   │   ├── exchangeRate.ts # 即時匯率服務（open.er-api.com，30 分鐘快取）
│   │   └── stockPrice.ts   # 股價服務（Yahoo Finance API，30 分鐘快取）
│   ├── utils/crypto.ts     # Web Crypto API 解密
│   ├── db/database.ts      # Dexie IndexedDB schema (v3)
│   └── types/index.ts      # 資料型別定義
├── scrapers/               # 獨立 Node.js 爬蟲專案
│   └── src/
│       ├── base-scraper.ts # 抽象基底類別 (Playwright)
│       ├── runner.ts       # 主執行器（輸出明文 + 加密 JSON）
│       ├── detect-selectors.ts  # 分析銀行登入頁的工具
│       ├── types.ts        # 爬蟲資料型別
│       ├── banks/          # 各銀行實作 (cathay, ctbc, esun, fubon, taishin)
│       └── utils/          # logger, retry, crypto（AES 加密）
├── data/                   # 爬蟲輸出（皆 .gitignore，由 Actions 產生）
│   ├── latest.json         # 明文（本地 debug 用）
│   └── latest.json.enc     # 加密版（Actions 自行 commit）
├── .github/workflows/      # CI/CD
│   ├── scrape.yml          # 每週一排程爬蟲 + 手動觸發
│   └── deploy.yml          # Build PWA + 部署 GitHub Pages
└── .mcp.json               # Chrome DevTools MCP 設定
```

## 資料流

1. GitHub Actions 排程或手動觸發爬蟲
2. Scraper 登入銀行 → 抓取資料 → 輸出 `latest.json` + 加密 `latest.json.enc`
3. Actions commit `.enc` → 觸發 deploy → Build PWA → GitHub Pages
4. 手機開 PWA → fetch `.enc` → 輸入密碼 → PBKDF2 解密 → 存入 IndexedDB
5. 外幣存款 / 美股透過即時匯率服務換算 TWD

## 股票持倉功能

- 手動新增台股（2330.TW）+ 美股（AAPL），輸入股數和平均成本
- 股價來源：Yahoo Finance chart API (`/v8/finance/chart/{ticker}`)
- Dev 環境透過 Vite proxy (`/yahoo-finance`) 繞過 CORS
- Production 透過 allorigins proxy
- 美股自動用匯率服務換算 TWD 顯示市值
- 30 分鐘快取，同匯率服務模式

## 各銀行爬蟲狀態

| 銀行 | 檔案 | 狀態 |
|------|------|------|
| 玉山 (E.SUN) | `scrapers/src/banks/esun.ts` | 完整（台幣、外幣、信用卡） |
| 中信 (CTBC) | `scrapers/src/banks/ctbc.ts` | TODO stub |
| 遠東銀行 | `scrapers/src/banks/feib.ts` | TODO stub |
| 永豐銀行 | `scrapers/src/banks/sinopac.ts` | TODO stub |
| LINE Bank | `scrapers/src/banks/linebank.ts` | TODO stub |

## GitHub Secrets

| Secret | 用途 |
|--------|------|
| `BANK_*_ENABLED/USERNAME/PASSWORD` | 各銀行帳密 |
| `SYNC_PASSWORD` | 同步密碼（PBKDF2 加解密共用） |
| `GH_PAT` | GitHub PAT（actions:write，PWA 觸發 workflow 用） |

## MCP 工具

已設定 Chrome DevTools MCP (`.mcp.json`)，可用於：
- 截圖銀行網站看 layout
- Network 攔截分析 API
- Console debug
- 直接操作瀏覽器自動化

開發爬蟲時優先使用 MCP 直接操作瀏覽器，確認流程後再決定是否寫成 Playwright 獨立腳本。

## 開發指令

```bash
# 前端開發
npm run dev          # Vite dev server（固定 port 5173）
npm run build        # 型別檢查 + 建置

# 爬蟲（在 scrapers/ 目錄）
cd scrapers
npm install
npm run scrape       # 執行爬蟲（需 .env 設定帳密 + SYNC_PASSWORD）
npm run scrape:dry   # 測試設定
```

## 注意事項

- 所有敏感資料（銀行帳密、密碼）透過環境變數傳入，**絕對不要** commit 到 repo
- `data/latest.json.enc` 不進版控，由 GitHub Actions 爬蟲 workflow 自行 commit
- commit message **不要**提及加密、GitHub Pages 等實作細節
- `source` 欄位區分 `'scraper'`（自動抓取）和 `'manual'`（手動輸入）的資料
- 台幣/外幣存款、信用卡由爬蟲自動抓取，不提供手動新增
- 股票持倉、自訂資產/負債由使用者手動管理，存在 IndexedDB
- 新增銀行爬蟲需繼承 `BaseScraper` 並在 `banks/index.ts` 註冊
