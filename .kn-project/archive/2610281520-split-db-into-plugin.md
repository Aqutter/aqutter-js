# 2610281520 - split-db-into-plugin

- Created: 2026-10-28 15:20 / Archived: 2026-10-28 18:30
- Issue: Aqutter/aqutter-js#8
- Milestone: N/A / Base Branch: main

## Summary
`aqutter-js` 移除資料庫的內建契約：`BridgeHandler.DbOpen`／`DbExec`、`DbOpenRequest`／`DbExecRequest`／`DbExecResponse` 與契約表項目；對應能力由 `aqutter-plugin-sqlite-drift` 提供。

## Cross-Repo Scope
- 共用計畫 ID `2610281520-split-db-into-plugin`、共用分支名 `feature/2610281520-split-db-into-plugin`。
- `Aqutter/aqutter-plugin-sqlite-drift`（新 repo，`#1`，契約正本）：Dart `SqliteDriftPlugin` 與網頁端 `AqutterSqliteDialect`。
- `Aqutter/aqutter-nuxt-app`（`#6`）：改用 plugin。
- `Aqutter/aqutter`（`#24`）：移除內建 DB handler 與 `drift`／`sqlite3` 依賴。
- `Aqutter/aqutter-js`（`#8`）：移除 `DbOpen`／`DbExec` 與三個型別。
- 順序：plugin → 範本專案 → 殼與 `aqutter-js`；建議合併順序同。

## Key Decisions
- **[Phase 0]** 整合主幹 `main`；四個 repo milestone 皆不指定，base 為 `main`。
- **[方向]** 殼瘦身：依賴重、不是每個 App 都需要的功能拆成官方 plugin，避免使用者改殼造成分岔、難以升版；資料庫（drift + sqlite3，含 Kysely dialect）是第一個。
- **[分層]** `aqutter_core` 與 `aqutter-cli` 不變更。
- **[Q1]** 新 repo 名稱 `Aqutter/aqutter-plugin-sqlite-drift`（使用者指定，名稱中多一層向 drift 致意），公開。
- **[Q2]** BLOB 直接傳二進位（現況契約註解寫 base64，但實作沒有解碼）。
- **[Q3]** 只搬 Flutter 那一半；瀏覽器 wasm 版與 Vue 的 `BaseSqliteDatabase` 留在 App——plugin 必須框架中立（使用者起初選了一起放進 plugin，檢視後改回）。
- **[Q4]** dialect 匯出名稱 `AqutterSqliteDialect`。
- **[Q5]** 統一傳輸合併後才開工（已合併）。
- **[Q6]** plugin id `sqlite`，與套件名分開：契約與實作分離，日後換其他實作可沿用同一個 id 與契約。
- **[契約]** rev 1 凍結（2026-10-28）；每個資料庫一條序列化連線加一個佇列，同一資料庫的語句依收到順序執行。
- **[執行模式]** 序列。
- **[完成後]** commit + 開 PR（併回 `main`）。

## Deviations
- 無契約變更。
- 範本專案的 `pubspec.lock` 把殼與 core 鎖在很舊的提交；實機驗證時發現新舊版本混用會讓傳輸連不上（WebSocket 403，頁面卡在載入畫面）。範本專案因此一併更新 `package.json` 的 client 與 `pubspec.lock`（等同 `aqutter upgrade` 做的事）。
- 範本專案與 plugin 的 `package.json` 目前指向 plugin 的功能分支；plugin 合併後要改成不帶分支的 `github:Aqutter/aqutter-plugin-sqlite-drift`。
- 量測：拆前拆後的建置時間與體積各只量一次（Android）；Windows 只做功能驗證。
- iOS、macOS、Linux 未驗證。

## Impact Files
- `src/contract/bridge.ts`（`DbExec`、`DbOpen` 列舉與三個型別）— 移除。
- `src/contract/table.ts`（匯入與兩個表項目）— 移除。

## Details
- 驗證：`tsc --noEmit` 乾淨、`vitest` 105 個全過。
