# 2611021700 - unsupported-platform-no-throw

- Created: 2026-11-02 17:00 / Archived: 2026-11-02
- Issue: N/A（使用者決議不建 issue）
- Milestone: N/A / Base Branch: main

## Summary
plugin 在這個平台用不了時，網頁端 `callPlugin` 不再拋錯而是回 `undefined`，正式版因此不會因為缺少某個平台的實作而壞掉；開發階段才在 console 警告一次。回傳型別改為 `Res | undefined`（破壞性的型別變更）。

## Cross-Repo Scope
- **共用計畫 ID**: `2611021700-unsupported-platform-no-throw`；各 repo 直接 `main`。
- 參與 repo：`aqutter-js`（契約正本）、`aqutter`（殼）、`aqutter-plugins`（官方 plugin 的網頁 API）、`aqutter-nuxt-app`（範例 App 與驗證）。

## 契約（只留引用）
正本是 `aqutter-js` 的 `src/index.ts`（`callPluginRaw`／`callPlugin`）與 `src/contract/models/platform.ts`（`PlatformInfo.dev`），修訂號 rev 1（2026-11-02 凍結，無變更）。要點：平台不支援（`UNSUPPORTED_PLATFORM`）、App 沒裝該 plugin（`HANDLER_NOT_FOUND`）、不在 Flutter 內，三種情況 `callPlugin` 回 `undefined` 不拋錯；其餘錯誤照舊拋出；`platform_info.dev` 為 true 時才在 console 警告一次，正式版安靜；回傳型別 `Res | undefined`。

## Key Decisions
- **[行為]** 不支援的平台回 `undefined`、型別改 `Res | undefined`（使用者選擇）。
- **[沒裝 plugin]** 也回 `undefined` — 網頁包 OTA 更新與殼版本可能落差，編譯期抓不到；開發階段警告補償。
- **[純瀏覽器]** 也回 `undefined`。
- **[警告]** 只在開發階段（`dev`），`console.warn` 一次性；正式版完全安靜。
- **[傳輸不變]** 殼仍回 `UNSUPPORTED_PLATFORM`，轉換只在網頁端，新舊殼與新舊網頁端任意組合都能運作。
- **[流程]** 直接 main、不建 issue。

## Deviations
- 無契約變更。
- 舊測試兩處因行為改變而更新（UNSUPPORTED_PLATFORM 不再拋錯、不在 Flutter 內不再拋錯）。

## Impact Files
- `src/index.ts`（`callPluginRaw`、`callPlugin`、`setBridgeCapabilities` 的 `dev`）— 轉換、型別、警告
- `src/contract/models/platform.ts`（`PlatformInfo.dev`）、`src/error.ts`（說明）
- `test/pluginUnsupported.test.ts`（new）、`test/pluginError.test.ts`、`test-types/*` — 測試與型別測試
- `README.md`、`.kn-project/wiki/platform/builtin-capabilities.md`

## Wiki Changes

## Wiki Changes

| 頁面 | 日期 | 版本 | 變動 | Issue | PR |
|---|---|---|---|---|---|
| `platform/builtin-capabilities.md` | 2026-11-02 | — | 用不了的 plugin 呼叫回 undefined，開發階段才警告 | — | — |
