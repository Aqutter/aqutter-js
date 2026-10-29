# 2610291408-console-file-logging

- Created: 2026-10-29 14:08 / Archived: 2026-10-29 16:30
- Issue: N/A（使用者決議不建 issue）
- Milestone: N/A / Base Branch: main

## Summary
讓網頁的 console.* 可依設定輸出到 devtools、寫成檔案或兩者，並新增 console.to.* 指定檔案的 provider／子目錄／檔名，目標可為函式、可在執行中更換；release 版可關閉 devtools。
能力放在框架中立的 aqutter-js（installConsoleLog），殼只負責安全落檔，nuxt-app 僅作範例接線。

## Cross-Repo Scope
- 共用計畫 ID：`2610291408-console-file-logging`；直接 main，無分支。
- 參與 repo：aqutter-js（契約、installConsoleLog、console.to）、aqutter（殼 LogService.append 支援 target 與驗證）、aqutter-nuxt-app（範例接線）。
- 執行順序：aqutter-js → aqutter（再更新 manifest 的 client.spec）→ aqutter-nuxt-app（aqutter upgrade 後接線）。本 repo：aqutter-js。

## Key Decisions
- **範圍**：能力在 aqutter-js、nuxt-app 僅範例 — 使用者明示。
- **Provider**：internal（預設）／documents／cache／temp／external（僅 Android）— 對應 path_provider 既有 API，不需額外權限。
- **安全**：dir／name 只允許相對安全字元、禁止 `..` 與絕對路徑，provider 不可用時報錯不改寫 — 避免 JS 任意寫檔；Dart 端為最後防線。
- **v1 範圍**：不攔 window.onerror，list／read／remove 不涵蓋自訂 target — 控制範圍（後續由 2610291528 補上 JS 錯誤捕捉）。
- **release**：SDK 不判斷環境，devtools 由 App 傳入 — SDK 框架中立，Nuxt 用 import.meta.dev。
- **流程**：直接 main、不建 issue；完成後只 commit（後續依使用者要求 push 並移動 tag 0.0.0）。
- **契約**：rev 1 凍結；rev 2 新增 TargetSource（target 可為函式，每筆呼叫當下求值）、setConsoleLogTarget、log_target_error（丟例外改走預設位置並提示一次）。
- **Iteration／換日驗證**：LogService 加可注入時鐘（預設行為不變）並補跨午夜測試；JS 補假時鐘測試；實機以每分鐘換檔名的函式 target 驗證。
- **useAppLog**：console 已被攔截時不再走 bridge 寫檔，避免同一行寫兩次。
- **執行模式**：序列（aqutter-js → aqutter → aqutter-nuxt-app）。

## Deviations
- 契約 rev 2（TargetSource 函式、setConsoleLogTarget、log_target_error）為執行中追加並經使用者核准。
- 錯誤代碼辨識由「訊息開頭」改為「訊息包含」，因殼的訊息會被框架加上前綴。
- 換日驗證為使用者要求的 Iteration：只補測試與殼的時鐘注入。
- 實機驗證：external 與 devtools 關閉已驗證；documents 未直接驗證（release 版讀不到 App 內部目錄）。

## Impact Files
- `src/contract/bridge.ts:133`（LogLevel 之後）— 新增 LogProvider、LogTarget；LogAppendRequest 新增 target
- `src/console.ts`（new）— installConsoleLog、isConsoleLogInstalled、setConsoleLogTarget、console.to
- `src/index.ts` — 匯出與接線
- `test/console.test.ts`（new）— 攔截、devtools／file 開關、序列化、to.*、函式 target、換日

## Wiki Changes

| 頁面 | 日期 | 版本 | 變動 | Issue | PR |
|---|---|---|---|---|---|
| `platform/console-log.md` | 2026-10-29 | — | console 輸出可分流到 devtools 與檔案，console.to 指定檔案位置 | — | — |
