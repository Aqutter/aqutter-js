# 2610291528-crash-error-capture

- Created: 2026-10-29 15:28 / Archived: 2026-10-29 16:30
- Issue: N/A（使用者決議不建 issue）
- Milestone: N/A / Base Branch: main

## Summary
JS 未捕捉錯誤（error／unhandledrejection）寫入與 console 相同的檔案，並在 installConsoleLog 時向殼取回 Dart 端待送錯誤紀錄、寫入 crashTarget、成功才確認。
新增 crash_take／crash_ack／error_report handler 與 crash_reports 事件，預留殼端 AqutterErrorReporter 接口（Crashlytics 先不接）。

## Cross-Repo Scope
- 共用計畫 ID：`2610291528-crash-error-capture`；直接 main，無分支。
- 參與 repo：aqutter-js（契約、JS 錯誤捕捉、crash 紀錄寫入與確認）、aqutter（殼：錯誤處理、待送紀錄、回報接口、crash_take／事件／ack）；aqutter-nuxt-app 不改（只做 aqutter upgrade）。
- 執行順序：aqutter-js → aqutter（再更新 manifest 的 client.spec 與 shell ref）。本 repo：aqutter-js。

## Key Decisions
- **範圍**：第一批只做 Dart＋JS；原生 crash／ANR／被殺／渲染進程崩潰另開計畫並寫入同一個待送紀錄 — Crashlytics 先不處理、只預留接口。
- **機制**：只用 Flutter SDK、dart:io、既有 path_provider 與既有 bridge，不新增第三方套件。
- **Dart 錯誤**：FlutterError.onError＋PlatformDispatcher.onError，不用 runZonedGuarded — PlatformDispatcher 已涵蓋非同步錯誤。
- **交付**：殼不寫檔，經事件／拉取交給 JS，由 JS 以 crashTarget（沒設就沿用 target，可為函式）寫入，寫成功才 ack 刪除 — 動態目標只存在 JS 端。
- **JS 錯誤**：error／unhandledrejection 走 console.error 並轉給殼的回報接口，不進待送紀錄 — JS 已自行寫檔。
- **契約**：rev 1 凍結；rev 2 新增 crash_take，crash_reports 改為「crash_take 之後才推、一次一筆」，移除與 app_ready 的掛鉤。
- **流程**：直接 main、不建 issue；完成後只 commit（後續依使用者要求 push 並移動 tag 0.0.0）。

## Deviations
- 契約 rev 2 為執行中追加並經使用者核准：由「app_ready 後殼推送」改為「JS 安裝時 crash_take 拉取、之後事件推送」。
- 實機驗證：拉取路徑、推送路徑、JS 未捕捉錯誤、重啟不重送皆已驗證。

## Impact Files
- `src/contract/bridge.ts:170`（BridgeEvent）— 新增 CrashReports；BridgeHandler 新增 CrashTake／CrashAck／ErrorReport；新增 CrashReportPayload 等型別
- `src/contract/table.ts:116`、`:190` — 登錄 handler 與事件
- `src/console.ts` — errors、crashTarget、crash_take 拉取、寫入與確認、id 去重
- `src/index.ts` — 注入新依賴
- `test/console.test.ts` — 錯誤監聽、crash 寫入與確認、拉取、去重、換日

## Wiki Changes

| 頁面 | 日期 | 版本 | 變動 | Issue | PR |
|---|---|---|---|---|---|
| `platform/console-log.md` | 2026-10-29 | — | 補上未捕捉錯誤與殼錯誤紀錄的取回寫入 | — | — |
