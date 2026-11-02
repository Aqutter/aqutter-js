# Plan: 2611021700 - unsupported-platform-no-throw
- Created: 2026-11-02
- Branch: N/A（直接 main）
- Issue: N/A（無 issue 追蹤基準）
- Milestone: N/A（未指定）
- Base Branch: main
- Status: Planning
- Completed: [Wait for Finish]

## Goals
plugin 在某個平台沒有實作時，**不能讓正式版壞掉**（使用者要求）。目前殼對不支援的 plugin 方法回 `UNSUPPORTED_PLATFORM`，網頁端的 `callPlugin` 因此拋出 `AqutterPluginError`；沒接住的呼叫會讓頁面出錯（實例：範例 App 在 Windows 因為呼叫通知而整頁 500）。

改成：`callPlugin` 對「這個平台用不了」的情況**不拋錯，回 `undefined`**；只有**開發階段**在 console 印一行警告，正式版完全安靜。回傳型別同步改成 `Res | undefined`，讓 TypeScript 在編譯時就逼呼叫端處理（使用者選擇）。各官方 plugin 的網頁 API 在不支援時回安全的預設值，不會變成 `TypeError`。

## Architecture
- **只改網頁端的轉換，不改傳輸語意**：殼仍然對不支援的方法回 `UNSUPPORTED_PLATFORM`（舊的網頁端與其他用戶端行為不變）；`callPluginRaw` 接住這個錯誤碼，轉成 `undefined`。因此新網頁端可搭配舊殼，舊網頁端搭配新殼行為也不變。
- **「不可用」的三種情況**（都回 `undefined`）：① 殼回 `UNSUPPORTED_PLATFORM`（plugin 在這個平台沒有實作）；② 殼回 `HANDLER_NOT_FOUND` 且是 plugin 的方法（這個 App 沒裝該 plugin）；③ 不在 Flutter 內（純瀏覽器開發）。其餘錯誤（plugin 自己的錯誤碼、`HANDLER_FAILED`、傳輸錯誤）**照舊拋出**，不被吞掉。
- **開發階段警告**：殼在 `platform_info` 多回報一個布林 `dev`（連 dev server 或 debug 建置時為 true）。網頁端在 `dev === true` 時，對每個（plugin、方法、原因）只印一次 `console.warn`；`dev` 不是 true 或尚未取得時**完全不印**（正式版安靜，保守為預設）。
- **殼端的輔助**：debug 建置時，殼對不支援的呼叫在 Dart 日誌印一行；release 不印。
- **不變**：`isPluginSupported`、能力表、事件（不支援的平台本來就收不到事件）。
- **型別是破壞性變更**：`callPlugin` 的回傳型別含 `undefined`，既有呼叫端若直接取欄位會編譯失敗，必須一併處理（範例 App、官方 plugin 的網頁 API）。

## Cross-Repo Scope
- **本計畫所屬 repo**: `aqutter-js`（契約正本：網頁 API 語意與 `platform_info.dev`）
- **共用計畫 ID**: `2611021700-unsupported-platform-no-throw`；各 repo 直接 `main`。
- **參與 repo 與職責**:
  - `aqutter-js` — `callPluginRaw`／`callPlugin` 的轉換與型別、警告、`PlatformInfo.dev` 型別、測試、wiki。
  - `aqutter` — 殼回報 `dev`、debug 日誌、`docs/plugins.md` 與 wiki、發佈清單的 client 版本更新。
  - `aqutter-plugins` — 各 plugin 的網頁 API 處理 `undefined`（安全預設值）、測試。
  - `aqutter-nuxt-app` — 內建功能的 composable 與頁面處理 `undefined`、升級對齊、實機與 Windows 驗證。
- **執行順序相依**: 契約凍結後，`aqutter-js` 先；`aqutter` 與 `aqutter-plugins` 依賴新型別，須等 `aqutter-js` push 並更新 client 版本；範例 App 最後。

## Contract / 介面契約
- **契約正本 repo**: `aqutter-js`　**修訂號**: `rev 1`　**狀態**: `草擬`

### 1. 網頁端 `callPlugin`／`callPluginRaw`
| 情況 | 現在 | 之後 |
|---|---|---|
| 殼回 `UNSUPPORTED_PLATFORM` | 拋 `AqutterPluginError` | 回 `undefined` |
| 殼回 `HANDLER_NOT_FOUND`（plugin 方法，沒裝該 plugin） | 拋 | 回 `undefined` |
| 不在 Flutter 內 | 拋 `Error` | 回 `undefined` |
| plugin 自己的錯誤碼、`HANDLER_FAILED`、`PAYLOAD_TOO_LARGE`、`TRANSPORT_*` | 拋 | **照舊拋** |
| 呼叫成功 | 回結果 | 回結果 |

回傳型別：`Promise<Res | undefined>`（`callPluginRaw` 為 `Promise<unknown>`，本來就含 `undefined`）。`callFlutter`（核心 handler）**不受影響**。

### 2. 開發階段警告
- 條件：`platform_info.dev === true`，且該（plugin、方法、原因）在本次頁面載入還沒印過。
- 格式：`[aqutter] plugin call skipped: <id>.<method> (<原因>)`，原因為 `unsupported on <platform>`、`plugin not installed` 或 `not running inside Flutter`；用 `console.warn`。
- `dev` 為 false、未提供（舊殼）或尚未取得時：不印。

### 3. `platform_info` 新欄位
| 欄位 | 型別 | 說明 |
|---|---|---|
| `dev` | `boolean`（選填） | 殼連 dev server 或為 debug 建置時為 `true`；省略視為 `false` |

### 4. 官方 plugin 的網頁 API
| 規則 | 說明 |
|---|---|
| 不支援時不拋 | 收到 `undefined` 就回該方法文件載明的安全預設值（例如 `list`→`[]`、`get`→`null`、`has`→`false`、寫入類→不做事並回 `undefined`） |
| 想主動判斷 | 仍用 `isPluginSupported(id, method)` |

### 5. 相容性
- 新網頁端＋舊殼：可用（走錯誤碼轉換；`dev` 缺少則不印警告）。舊網頁端＋新殼：行為不變（仍拋錯）。
- 破壞性：僅限 TypeScript 型別（`Res | undefined`）；執行期對「原本會拋」的情況改成回 `undefined`。

### 6. 變更紀錄
- _(尚無)_

## Impact Files
- `src/index.ts:250`（`callPluginRaw`）、`:257`（`callPlugin`）— 轉換與型別
- `src/index.ts:98`（能力表狀態）旁 — 儲存 `dev` 旗標與警告去重
- `src/index.ts:286`（`isPluginSupported` 的說明）— 更新「直接呼叫會拋錯」的敘述
- `src/contract/models/platform.ts:20`（`PlatformInfo`）— 新增 `dev?`
- `src/error.ts:1`（`AqutterPluginError` 的說明）— 標註哪些碼會被轉成 `undefined`
- `test/pluginUnsupported.test.ts`（new）— 三種情況回 `undefined`、其餘照拋、警告只在 dev 且每個原因印一次、舊殼相容
- `test/builtinPlugins.test.ts`（既有）— 型別與回傳的調整
- `.kn-project/wiki/**` — 對應頁面現況（plugin 呼叫與錯誤）

## Open Questions / 待確認事項
### Q1. 「沒裝該 plugin」（`HANDLER_NOT_FOUND`）也回 `undefined` 嗎？ — 影響範圍：`callPluginRaw`
- [ ] 是（建議：符合「缺實作不能弄壞正式版」，開發階段仍會警告，拼錯方法名在 dev 看得到）
- [ ] 否，只處理 `UNSUPPORTED_PLATFORM`（沒裝 plugin 仍拋錯，較容易發現漏裝）
- **決議**：_(待確認)_　狀態：⏳ 待確認

### Q2. 純瀏覽器（不在 Flutter 內）也回 `undefined` 嗎？ — 影響範圍：`callPluginRaw`
- [ ] 是（建議：純瀏覽器開發時各功能不再需要到處 try/catch；因為沒有 `platform_info`，這種情況不會印警告）
- [ ] 否，維持拋錯
- **決議**：_(待確認)_　狀態：⏳ 待確認

### Q3. 警告的出口 — 影響範圍：開發階段的提示
- [ ] `console.warn` 一次性（建議：最簡單，Nuxt 的開發者工具看得到）
- [ ] 也寫進殼的日誌檔
- **決議**：_(待確認)_　狀態：⏳ 待確認

## Manual Follow-ups / 人工收尾事項
- **[合併後]** 使用 `callPlugin` 的既有 App 升級後 TypeScript 會報型別錯誤，需要處理 `undefined` — 這是預期的破壞性型別變更 — 屬各 App 的程式碼，agent 不代改（範例 App 由本計畫處理）。

## Key Decisions
- **[行為]** 不支援的平台回 `undefined`、型別改 `Res | undefined`（使用者選擇）。
- **[警告]** 只在開發階段（`dev`）印警告，正式版完全安靜（使用者要求）。
- **[傳輸不變]** 殼仍回 `UNSUPPORTED_PLATFORM`，轉換只在網頁端 — 理由：新舊殼與新舊網頁端任意組合都能運作。
- **[流程]** 直接 main、不建 issue（待核准時確認）。

## Git Completion Policy
- commit 自動；push 依核准閘選項。

## References
- `aqutter/shell/lib/src/bridge/bridge_registry.dart:204`（目前的 `UNSUPPORTED_PLATFORM` 回應）、`aqutter/docs/plugins.md`
