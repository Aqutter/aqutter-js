# 2610221548-plugin-supported-platforms-and-multiplatform-map

- Created: 2026-10-22 15:48 / Archived: 2026-10-22 17:00
- Issue: Aqutter/aqutter-js#1
- Milestone: N/A / Base Branch: main

## Summary
`callPlugin`／`callPluginRaw` 把殼回傳的保留格式錯誤資料 `{ aqutterError: { code, message } }` 轉成 `AqutterPluginError`（帶 `code`），讓呼叫不支援平台的 plugin 方法明確失敗；`isPluginSupported` 說明補上支援平台宣告。這是 `Aqutter/aqutter`（plugin 宣告支援平台）與 `Aqutter/aqutter-plugin-google-maps`（多平台地圖）計畫的一部分，契約正本在 `Aqutter/aqutter`（rev 2）。

## Key Decisions
- **[契約 rev 2]** 不用例外而用錯誤資料回報 — 理由：例外如何傳回網頁取決於各原生平台，無法逐一驗證；殼的慣例本來就是回傳錯誤資料。使用者於 2026-10-22 核准。
- **[完成後]** commit + 開 PR。

## Details
- 驗證：`pnpm typecheck` 通過、`pnpm test` 46/46（新增 4 個轉換測試）。
- 合併後的人工收尾：在 `Aqutter/aqutter` 更新 manifest 的 `client.spec`、移動 tag `0.0.0`、同步 CLI 快照、範本專案跑 `aqutter upgrade`。
