# 2610310119 - shell-kotlin-and-feature-plugins-web-types

- Created: 2026-10-31 01:19 / Archived: 2026-10-31 22:47
- Issue: N/A（不建 issue；追蹤在 Aqutter/aqutter#43）
- Milestone: N/A / Base Branch: main

## Summary
網頁端 client 的剪貼簿、分享、本機通知、深層連結改成四個內建 plugin 的型別（`clipboard`、`share`、`notification`、`deeplink`），用 `callPlugin`／`onPluginEvent`／`isPluginSupported` 有完整型別地呼叫，並移除對應的舊 `BridgeHandler`／`BridgeEvent` 項目與型別表條目（breaking，開發階段 `0.0.0`）。
動機是配合殼把內建功能統一成 `AqutterPlugin` 寫法（契約 rev 1，正本在 `aqutter`）；請求／回應型別本身不變。影響 `src/contract/`、`src/index.ts` 與測試。

## Cross-Repo Scope
- 共用計畫 ID：`2610310119-shell-kotlin-and-feature-plugins`；本 repo 是契約消費方，直接 main、無分支、無 issue；issue 在 `aqutter`（`Aqutter/aqutter#43`）。
- 參與 repo：`aqutter`（殼與契約正本）、`aqutter-js`（本 repo）、`aqutter-nuxt-app`（範例 App 跟版）；`aqutter-cli`、`aqutter-plugin-*` 無引用。
- 執行順序：aqutter-js → aqutter → aqutter-nuxt-app；`aqutter` 的 manifest `client.spec` 指向本 repo commit `18c2dbe`，tag `0.0.0` 已移到同一 commit。

## Contract
- 正本 repo：`aqutter`；最終修訂號：rev 1（凍結，2026-10-31 核准）。契約全文不收錄於此，見 `aqutter` 的 `docs/native-features.md`。
- 方法：`clipboard.{read,write,readImage,writeImage}`、`share.open`、`notification.{show,schedule,cancel,initial}`、`deeplink.initial`；事件：`notification.tapped`、`deeplink.received`。

## Key Decisions
- **[共用]** 本計畫是 `aqutter` 同名計畫的消費方；Milestone 不指定、base `main`、直接推 `main`、無 issue — 本 repo project.md 的開發階段工作流程。
- **[共用]** 改走 plugin、名稱、逐方法平台的決策見 `aqutter` 同名計畫，這裡不重複。
- **[Phase 1]** 不拆分 — 型別改寫是單一模組的連動變更。
- **[契約]** rev 1 於 2026-10-31 凍結，之後未變更。
- **[流程]** 完成後只 commit，不 rebase、不 push（使用者選擇）；後來因 `aqutter` 跟版需要，`main` 與 tag 已依使用者指示推送。
- **[執行模式]** 序列，順序 aqutter-js → aqutter → aqutter-nuxt-app。

## Deviations
- 前一份計畫（`2610301536`）預期而未補的 `test/bridgeCapabilities.test.ts` 一致性測試，本計畫以 `test/builtinPlugins.test.ts` 補上。
- 契約凍結後未發生契約變更。

## Impact Files
- `src/contract/builtinPlugins.ts:39-96` (new) — 四個內建 plugin 的 `PluginDefinition` 與 `BuiltinPluginRegistry`。
- `src/index.ts` — `AqutterPluginRegistry extends BuiltinPluginRegistry`，並更新 plugin 說明註解。
- `src/contract/bridge.ts:77-101`、`:226-229` — 刪除 10 個 `BridgeHandler` 與 2 個 `BridgeEvent` 項目；`:327-456` 請求／回應型別保留，註解連結改指新名稱。
- `src/contract/table.ts:150-162`、`:228-229` — 刪除對應條目與無用 import；`src/contract/index.ts` 匯出新檔。
- `test/builtinPlugins.test.ts` (new)、`test-types/builtin-plugins.ts` (new) — 執行期與型別測試；158 個測試與型別檢查通過。
- `.kn-project/project.md`、`.kn-project/wiki/platform/builtin-capabilities.md` — 能力一覽改為新名稱。

## Wiki Changes

## Wiki Changes

| 頁面 | 日期 | 版本 | 變動 | Issue | PR |
|---|---|---|---|---|---|
| `platform/builtin-capabilities.md` | 2026-10-31 | — | 網頁端剪貼簿、分享、本機通知、深層連結改成四個內建 plugin 的型別 | — | — |
