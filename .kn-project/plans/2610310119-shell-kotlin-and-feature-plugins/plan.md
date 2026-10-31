<!-- REMINDER: Relative Paths Only! No file:///c:/... -->
# Plan: 2610310119 - shell-kotlin-and-feature-plugins
- Created: 2026-10-31
- Branch: N/A（project.md：開發階段直接推 main）
- Issue: N/A（不建 issue）
- Milestone: N/A（未指定）
- Base Branch: main
- Status: In Progress
- Completed: [Wait for Finish]

## Goals
依契約 rev 1 改寫網頁端 client：移除剪貼簿、分享、本機通知、深層連結的舊 `BridgeHandler`／`BridgeEvent` 項目與型別表項目，改為四個內建 plugin（`clipboard`、`share`、`notification`、`deeplink`）的 `PluginDefinition` 型別，併入 `AqutterPluginRegistry`，讓 `callPlugin('share', 'open', …)` 與 `onPluginEvent('notification', 'tapped', …)` 有完整型別。請求／回應型別本身不變。同時補上前一份計畫缺的一致性測試。

## Architecture
- **現況**：四組功能的 handler 與事件是 `BridgeHandler`／`BridgeEvent` enum 項目（`src/contract/bridge.ts:77-101`、`:226-229`），在 `src/contract/table.ts:150-162`、`:228-229` 對應請求／回應型別；plugin 型別機制已存在（`PluginDefinition`、`AqutterPluginRegistry`、`callPlugin`、`onPluginEvent`、`isPluginSupported`，`src/index.ts:195-282`）。
- **目標**：新增 `src/contract/builtinPlugins.ts`，以 module augmentation 宣告 `AqutterPluginRegistry` 的四個內建 plugin（方法與事件對照契約 §1）；`src/index.ts` 匯入它使型別隨套件生效。型別介面（`ClipboardReadResponse`…`DeepLinkPayload`）原地保留（`bridge.ts:355-456`）。
- 舊 enum 項目與 `table.ts` 條目、`table.ts:34-73` 內僅為它們存在的 import 一併刪除。
- 順序：契約凍結後與殼的 Phase 2–3 平行；完成後 commit，供殼更新 `manifest/releases.json` 的 `client.spec`。實作遵守 `kn-project-code-style`。


## Cross-Repo Scope
- **本計畫所屬 repo**: `aqutter-js`（契約的消費方：網頁端型別）
- **共用計畫 ID**: `2610310119-shell-kotlin-and-feature-plugins`　**共用分支名**: `feature/2610310119-shell-kotlin-and-feature-plugins`（`aqutter-js`、`aqutter-nuxt-app` 的 project.md 規定開發階段直接推 `main`，其計畫的 Branch 為 N/A，沿用既有慣例；本 repo 是否建分支於核准閘決定）
- **參與 repo 與職責**（Rule 20：一 repo 一 issue；`aqutter-js`、`aqutter-nuxt-app` 依其 project.md 不建 issue）:
  - `aqutter` — 殼：Kotlin 轉換、內建 plugin 化、`AqutterPlugin` 逐方法平台、移除舊名稱、更新 manifest；issue: `Aqutter/aqutter#43`
  - `aqutter-js` — 網頁端 client：移除舊 `BridgeHandler`／`BridgeEvent` 項目與對應型別表，新增四個內建 plugin 的 `PluginDefinition` 型別；issue: `N/A`
  - `aqutter-nuxt-app` — 範例 App：改用 `callPlugin`／`onPluginEvent`／`isPluginSupported`，並用 `aqutter upgrade` 跟版；issue: `N/A`
- **執行順序相依**: 契約 rev 1 凍結後，`aqutter` 與 `aqutter-js` 可平行；兩者都完成並各自 commit 後，`aqutter` 更新 `manifest/releases.json`（`shell` ref 與 `client.spec` 為各自的 commit sha）；最後 `aqutter-nuxt-app` 跟版並驗證。**不得讓半套契約落地。**
- **跨 repo 檔案指涉**: `aqutter-js`：`src/contract/bridge.ts`、`src/contract/table.ts`、`src/index.ts`；`aqutter-nuxt-app`：`app/composables/Native/useNativeFeatures.ts`、`app/pages/native.vue`。`aqutter-cli` 與 `aqutter-plugin-*` 經 Phase 0 搜尋無引用，不在範圍。

## Contract / 介面契約
- **契約正本 repo**: `aqutter`　**修訂號**: `rev 1`　**狀態**: `凍結（核准日 2026-10-31）`

### 1. 方法與事件
內建 plugin 採一般 plugin 命名規則：handler `<id>.<method>`、事件頻道 `<id>.<event>`；網頁以 `callPlugin(id, method, payload)`、`onPluginEvent(id, event, listener)`、`isPluginSupported(id, method)` 使用。**舊名稱全部移除，不留別名。**

| # | 新方法 | 取代的舊 handler | 請求型別 | 回應型別 | 支援平台 |
|---|---|---|---|---|---|
| 1 | `clipboard.read` | `clipboard_read` | `NoPayload` | `ClipboardReadResponse` | 全部 |
| 2 | `clipboard.write` | `clipboard_write` | `ClipboardWriteRequest` | `OkResponse` | 全部 |
| 3 | `clipboard.readImage` | `clipboard_read_image` | `NoPayload` | `ClipboardReadImageResponse` | Android、iOS、macOS、Windows |
| 4 | `clipboard.writeImage` | `clipboard_write_image` | `ClipboardWriteImageRequest` | `OkResponse` | Android、iOS、macOS、Windows |
| 5 | `share.open` | `share_open` | `ShareOpenRequest` | `ShareOpenResponse` | 全部 |
| 6 | `notification.show` | `notify_show` | `NotifyShowRequest` | `NotifyIdResponse` | Android、iOS、macOS |
| 7 | `notification.schedule` | `notify_schedule` | `NotifyScheduleRequest` | `NotifyIdResponse` | Android、iOS、macOS |
| 8 | `notification.cancel` | `notify_cancel` | `NotifyCancelRequest` | `OkResponse` | Android、iOS、macOS |
| 9 | `notification.initial` | `notify_initial` | `NoPayload` | `NotifyInitialResponse` | Android、iOS、macOS |
| 10 | `deeplink.initial` | `deeplink_initial` | `NoPayload` | `DeeplinkInitialResponse` | Android、iOS、macOS |

| 事件頻道 | 取代的舊事件 | payload 型別 | 平台 |
|---|---|---|---|
| `notification.tapped` | `notify_tapped` | `NotifyTappedPayload` | Android、iOS、macOS |
| `deeplink.received` | `deep_link` | `DeepLinkPayload` | Android、iOS、macOS |

### 2. 請求與回應欄位
欄位、型別、可空、預設值、單位與限制**全部沿用 rev 2，不變**：型別正本是 `aqutter-js` 的 `src/contract/bridge.ts:355-456`（型別名稱如上表），數值限制（文字 ≤ 1,000,000 字、圖片與分享檔案 ≤ 5 MiB／5,242,880 位元組、分享最多 5 個檔案、`name` 為單一檔名且 ≤ 128 字）見 `docs/native-features.md`。本修訂只改名稱，不改任何欄位。

### 3. 錯誤碼
沿用 rev 2，不新增、不刪除：`invalid_argument`（參數驗證失敗，含 MIME 與位元組不符）、`too_large`（圖片超過 5,242,880 位元組，僅 `clipboard.readImage`）、`permission_denied`（通知未授權，僅 `notification.show`／`schedule`）、`UNSUPPORTED_PLATFORM`（本平台不支援該方法）。

### 4. 狀態與規則
- 能力表（`platform_info.capabilities`）內的名稱為 `<id>.<method>`；方法在本平台不支援時：仍註冊、不列入能力表、呼叫回 `UNSUPPORTED_PLATFORM`。網頁以 `isPluginSupported(id, method)` 查詢；能力表尚未取得時視為支援。
- 內建 plugin id 為 `clipboard`、`share`、`notification`、`deeplink`，使用者 plugin 不得同名（組裝期丟 `ArgumentError`）。
- 事件在網頁未連線時丟棄；啟動 App 的通知與連結只由 `notification.initial`／`deeplink.initial` 取得，不走事件。通知與深層連結服務只啟動一次，WebView 重掛不重複訂閱。
- 殼與網頁之間的 RPC 傳輸、二進位酬載（`Uint8List`／`Uint8Array`）規則不變。

### 5. 相容性
- **breaking**：`BridgeHandler` 的 `ClipboardRead`…`DeeplinkInitial`（10 項）與 `BridgeEvent` 的 `NotifyTapped`、`DeepLink` 移除，舊名稱呼叫會失敗。理由：目前為開發階段版本 `0.0.0`，沒有已發佈的相依者；已知的使用端只有 `aqutter-nuxt-app`。
- 殼內部的 MethodChannel 名稱與 Android／iOS 原生行為不變。
- 其餘 `BridgeHandler`／`BridgeEvent`（平台、儲存、下載、日誌…）完全不動。

### 6. 變更紀錄
- _(尚無)_

## Impact Files
Phase 0 Code Evidence Scan 取得的錨點（路徑相對本 repo root）：
- `src/contract/bridge.ts:77-101` (`BridgeHandler.ClipboardRead`…`DeeplinkInitial`)、`:226-229` (`BridgeEvent.NotifyTapped`、`DeepLink`) — 刪除這 10 + 2 個項目與其註解。
- `src/contract/bridge.ts:355-456` — 請求／回應型別保留；註解中引用 `BridgeHandler.X`／`BridgeEvent.X` 的連結（如 :405、:440、:451）改指新名稱。
- `src/contract/table.ts:150-162`、`:228-229` — 刪除對應條目；`:34-73` 清掉無用 import。
- `src/index.ts:195-282` — 匯入新檔；更新 plugin 說明註解提到內建 plugin。
- `src/contract/builtinPlugins.ts` (new) — 四個內建 plugin 的 `PluginDefinition` 與 module augmentation。
- `test/bridgeCapabilities.test.ts` — 補新名稱的能力表／`isPluginSupported` 一致性測試（前一份計畫預期而未補）。
- `test-types/plugin-types.ts` — 補型別測試：`callPlugin('clipboard','readImage')` 回應型別、`onPluginEvent('notification','tapped')` payload 型別。
- `.kn-project/project.md`、`.kn-project/wiki/platform/builtin-capabilities.md` — 能力一覽改為新名稱；由 `kn-project-wikification` 在 Phase 5 同步。

## App-Flow Screens
（本專案無 `.kn-project/app-flow.json`，刪除本節。）

## Open Questions / 待確認事項
無（見 `aqutter` repo 同名計畫的 Key Decisions）。

## Manual Follow-ups / 人工收尾事項
- **[合併後]** 通知 `aqutter` 把 `manifest/releases.json` 的 `client.spec` 更新為本 repo 的 commit sha，並把本 repo 的 git tag `0.0.0` 移到最新 `main` — 依 `.kn-project/project.md`「版本對應以 manifest 為準」 — manifest 在另一個 repo，tag 為對外可見操作

## Key Decisions
- **[共用]** 本計畫是 `aqutter` 同名計畫的消費方；Milestone 不指定、base `main`、直接推 `main`，無 issue — 理由：本 repo `.kn-project/project.md` 的開發階段工作流程。
- **[共用]** 契約 rev 1 的決策（改走 plugin、名稱、逐方法平台）見 `aqutter` 同名計畫的 Key Decisions，這裡不重複。
- **[Phase 1]** 不拆分：型別改寫是單一模組的連動變更。

- **[契約]** rev 1 凍結（核准日 2026-10-31）。
- **[流程]** 完成後：只 commit（不 rebase、不 push，使用者選擇）；前一份歸檔 commit `4d717c2` 同樣尚未 push。
- **[執行模式]** 序列，順序 aqutter-js → aqutter → aqutter-nuxt-app（依據見 aqutter 計畫）。

## Git Completion Policy
- 本 repo 開發階段直接推送 `main`（project.md）。commit 一律自動 (Rule 17)；push 只在核准閘的「完成後」選項涵蓋或使用者當下明說時才做。
- Branch 與 Issue 皆為 N/A，commit 訊息不放 `Closes #`。
- 跨 repo 時，本 repo 自己處理自己的提交 (Rule 19)。建議次序見 `aqutter` 計畫的 `## Cross-Repo Scope`。

## References
- `aqutter` repo 同名計畫（契約正本）。
- 前置歸檔：本 repo `.kn-project/archive/2610301536-builtin-clipboard-share-notify-deeplink.md`。
