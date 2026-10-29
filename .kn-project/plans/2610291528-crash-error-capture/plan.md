<!-- REMINDER: Relative Paths Only! No file:///c:/... -->
# Plan: 2610291528 - crash-error-capture
- Created: 2026-10-29
- Branch: N/A（直接 main，已確認）
- Issue: N/A（使用者決議不建 issue）
- Milestone: N/A（未指定；project.md 開發階段不開 milestone）
- Base Branch: main
- Status: In Progress
- Completed: [Wait for Finish]

## Goals
第一批（純 Dart + JS，不碰原生）：(1) 殼掛 `FlutterError.onError`／`PlatformDispatcher.onError`，錯誤寫入 spool 並在網頁就緒後交給 JS 寫到目標檔案（沿用 `target`／`crashTarget`，可為函式）；(2) JS 未捕捉錯誤（`error`／`unhandledrejection`）寫入同一個 log 檔；(3) 預留 `AqutterErrorReporter` 接口（先不接 Firebase Crashlytics），Dart 與 JS 來源的錯誤都能派給 reporter。第二批（原生 crash／ANR／被殺／渲染進程崩潰，寫入同一個 spool）另開計畫。

## Architecture
`ConsoleLogDeps` 新增 `onCrashReports`、`ackCrash`、`reportError` 與 `errorTarget`（預設 `globalThis`，可注入以便測試）。`installConsoleLogWith` 在 `errors !== false` 時監聽 `error`／`unhandledrejection`，轉成 `console.error` 並 `reportError`；訂閱 `crash_reports`，每筆以 `crashTarget`（函式於收到當下求值）寫成單行後，等該批寫入佇列完成且全數成功才 `ackCrash`，失敗者不 ack。`index.ts` 以 `onFlutterEvent`／`callFlutter` 接線。

## Cross-Repo Scope
- **本計畫所屬 repo**: `aqutter-js`
- **共用計畫 ID**: `2610291528-crash-error-capture`　**共用分支名**: N/A（直接 main）
- **參與 repo 與職責**: `aqutter-js`（契約、JS 錯誤捕捉、crash 寫入與確認）、`aqutter`（殼：錯誤處理、spool、reporter、事件與 handler）；`aqutter-nuxt-app` 不改（預設值即生效，之後僅 `aqutter upgrade`）。
- **執行順序相依**: aqutter-js（契約型別）→ aqutter（殼；push 後更新 `manifest/releases.json` 的 `client.spec`）。
- **跨 repo 檔案指涉**: 無。

## Contract / 介面契約
- **契約正本 repo**: `aqutter-js`　**修訂號**: `rev 2`　**狀態**: `凍結（核准日 2026-10-29）`

### 1. 介面
| # | 方向 | 名稱 | 說明 |
|---|---|---|---|
| 1 | 殼→JS 事件 | `crash_reports`（`BridgeEvent.CrashReports`） | **rev 2**：只在 JS 呼叫過 `crash_take` 之後，殼每記下一筆新的 Dart 錯誤就送出該筆（`reports` 只含這一筆）；不再與 `app_ready` 掛鉤 |
| 5 | JS→殼 handler | `crash_take`（`BridgeHandler.CrashTake`，rev 2） | JS 於 `installConsoleLog` 時呼叫，殼回傳目前所有未確認的紀錄（最多 50 筆、由舊到新），並把「JS 已可接收」記下，之後的新紀錄才以事件推送 |
| 2 | JS→殼 handler | `crash_ack`（`BridgeHandler.CrashAck`） | JS 已把紀錄寫入目標檔案後確認，殼刪除對應 spool |
| 3 | JS→殼 handler | `error_report`（`BridgeHandler.ErrorReport`） | JS 未捕捉錯誤轉給殼的 reporter（預留 Crashlytics 等）；**不**進 spool、不寫檔（JS 已自行寫檔） |
| 4 | JS API | `installConsoleLog` 新選項 `errors`、`crashTarget` | 見下 |

### 2. 欄位
**`CrashReportPayload`**（事件 `crash_reports` 的 `reports[]` 元素）
| 欄位 | 型別 | 必填 | 說明 |
|---|---|---|---|
| `id` | `string` | 是 | 唯一，`{epochMs}-{隨機 6 碼 hex}`；亦為 spool 檔名 |
| `time` | `string` | 是 | ISO 8601 UTC，錯誤發生當下 |
| `source` | `'flutter' \| 'platform' \| 'native'` | 是 | `flutter`＝`FlutterError.onError`；`platform`＝`PlatformDispatcher.onError`（非同步未捕捉）；`native` 保留給第二批 |
| `fatal` | `boolean` | 是 | `flutter`：`false`；`platform`：`true`；`native` 依事件 |
| `message` | `string` | 是 | ≤ 8 KiB，超過截斷 |
| `stack` | `string` | 否 | ≤ 32 KiB，超過截斷 |
| `extra` | `Record<string,string>` | 否 | 附加資訊（如 library、context），值皆字串 |

事件 payload：`{ reports: CrashReportPayload[] }`（rev 2：每次一筆）。

**`crash_take` 請求**：`{}`；回應 `{ reports: CrashReportPayload[] }`（最多 50 筆，依 `time` 由舊到新；空陣列代表沒有）。JS 寫入並 `crash_ack` 後，若回傳筆數等於 50 就再呼叫一次，直到小於 50。

**`crash_ack` 請求**：`{ ids: string[] }`；回應 `{ ok: true }`。未知 id 忽略。
**`error_report` 請求**：`{ message: string, stack?: string, fatal: boolean }`；回應 `{ ok: true }`。

**`installConsoleLog` 新選項**
| 欄位 | 型別 | 預設值 | 說明 |
|---|---|---|---|
| `errors` | `boolean` | `true` | 監聽 `window` 的 `error` 與 `unhandledrejection`：以 `console.error('[uncaught]', …)` 輸出（受 `devtools`／`file`／`target` 設定約束），並呼叫 `error_report` 轉給殼；`fatal` 一律 `false` |
| `crashTarget` | `TargetSource` | 同 `target` | 收到的 `crash_reports` 寫到哪裡（函式於收到當下求值） |

**crash 行格式**（level `error`，單行，換行轉義為 `\n`）：`[crash:{source}{:fatal?}] {id} {time} {message}`，有 stack 時再接 ` | {stack}`。

### 3. 錯誤
| 情況 | 行為 |
|---|---|
| 寫檔失敗（含殼回報 `log_invalid_target` 等） | 該筆**不** ack，留在 spool，下次 `app_ready` 再送；錯誤依既有規則提示一次 |
| JS 重複收到同一 `id`（ack 前重送） | 允許重複寫入；行內含 `id` 供辨識 |
| `error_report`／`crash_ack` 失敗 | 吞掉，不影響頁面 |

### 4. 狀態與規則
- spool：`{getApplicationSupportDirectory}/crash_pending/{id}.json`，上限 50 筆，超過時丟棄最舊；殼啟動時不清空（跨重啟保留）。
- 殼端 Dart 錯誤一律先寫 spool（耐久），再通知已註冊的 `AqutterErrorReporter`；JS 呼叫過 `crash_take` 後，每筆新紀錄立刻以 `crash_reports` 事件送出（一次一筆）。網頁重新載入後 JS 會再次 `crash_take`，取回所有未 ack 的紀錄，因此事件在連線中斷時被丟棄也不會遺失。
- JS 對同一個 `id` 在寫入進行中（尚未 ack）不重複寫入（記憶體內去重）；跨頁面載入的重送允許重複，行內含 `id` 供辨識。
- `AqutterErrorReporter` 接口（Dart，殼對外公開）：`void report(AqutterErrorReport report)`；殼對 reporter 的呼叫以 try/catch 包住，reporter 丟例外不影響其他 reporter 或殼。JS 來源（`error_report`）也會派給 reporter，其 `source` 為 `web`（僅 Dart 端 reporter 看得到，不在線上格式的 `CrashReportPayload.source` 內）。
- rev 2 移除原本「須在 `app_ready` 之前安裝」的前提：交付由 JS 的 `crash_take` 觸發，與 `app_ready` 無關。

### 5. 相容性
- 舊 JS 不呼叫 `crash_take`：殼不會送事件，紀錄留在 spool、不會遺失，也不影響頁面。
- 舊殼沒有 `crash_take`／`crash_ack`／`error_report` handler：新 JS 呼叫失敗被吞掉，`installConsoleLog` 其餘功能不變。
- 新增事件與 handler 為純新增。

### 6. 變更紀錄
- 2026-10-29 rev 2：新增 `crash_take`；`crash_reports` 事件改為「`crash_take` 之後才推、一次一筆」，不再與 `app_ready` 掛鉤。原因：簡化殼的就緒追蹤與送出邏輯、移除安裝順序前提。影響：`aqutter-js`、`aqutter`；線上其他格式不變。

## Impact Files
- `src/contract/bridge.ts:170` (`BridgeEvent`) — 新增 `CrashReports`；`:45` (`BridgeHandler.LogAppend` 附近) 新增 `CrashAck`、`ErrorReport`；新增 `CrashReportPayload`、`CrashAckRequest`、`ErrorReportRequest`、`CrashSource`
- `src/contract/table.ts:116` (`BridgeContract` 的 Log 區) — 登錄兩個 handler；`:190` (`BridgeEventContract`) 登錄事件
- `src/console.ts` (`ConsoleLogOptions`／`ConsoleLogDeps`／`installConsoleLogWith`) — 錯誤監聽、crash 寫入與 ack
- `src/index.ts` (`installConsoleLog`) — 注入新依賴
- `test/console.test.ts` — 錯誤監聽、crash 寫入、失敗不 ack、函式 crashTarget、解除安裝

## App-Flow Screens
（無 app-flow.json）

## Open Questions / 待確認事項
### Q1. 版控與 issue 流程 — 影響範圍：流程
- [x] 直接 main、不建 issue
- [ ] 直接 main、各建一張 issue
- **決議**：直接 main、不建 issue　狀態：✅ 已確認

## Manual Follow-ups / 人工收尾事項
- **[上線前]** Android 實機驗證：在範例 App 觸發一個 Dart 未捕捉錯誤，確認重新載入網頁後 log 檔出現 `[crash:platform…]` 行且 spool 被清空 — 以 adb 與 WebView 遠端除錯檢查 — agent 無法自行操作 App 的 UI 來觸發錯誤

## Key Decisions
- **[範圍]** 第一批不碰原生；原生 crash／ANR／被殺／渲染進程崩潰另開計畫並寫入同一個 spool — 理由：使用者決定先做 Dart＋JS，Crashlytics 先不處理、只預留接口。
- **[機制]** 只用 Flutter SDK、`dart:io`、既有 `path_provider` 與既有 bridge，不新增第三方套件 — 理由：使用者要求。
- **[Dart 錯誤]** 以 `FlutterError.onError`＋`PlatformDispatcher.instance.onError` 為主，不用 `runZonedGuarded` — 理由：新版 Flutter 的 PlatformDispatcher 已涵蓋 zone 外的非同步錯誤；只有一種合理作法。
- **[交付]** crash 由殼經事件交給 JS，由 JS 以 `crashTarget`（含函式）寫入，寫完才 ack 刪 spool — 理由：使用者設定的動態目標只存在 JS 端；ack 後刪除確保中途被殺不遺失。
- **[JS 錯誤]** `error`／`unhandledrejection` 走 `console.error`（受既有設定約束）並轉給殼 reporter，不進 spool — 理由：JS 已自行寫檔，避免重複。

## Git Completion Policy
- 開發階段直接推送 `main`；commit 自動；不開 PR；歸檔依 Rule 13。
- 跨 repo 時各自 commit，不存在跨 repo 單一 PR (Rule 19)。

## References
- 上一個計畫：`2610291408-console-file-logging`（`installConsoleLog`、`target`）。
- **[Q1]** 直接 main、不建 issue — 理由：符合 project.md；使用者於核准閘選定。
- **[契約]** rev 1 凍結（2026-10-29）。
- **[契約]** rev 2 凍結（2026-10-29，使用者核准）：JS 於安裝時 `crash_take` 拉取、之後事件推送；移除 `app_ready` 掛鉤（Rule 29）。
- **[完成後]** 只 commit（不 push、不 PR、不歸檔）。
- **[執行模式]** 序列（依據：aqutter 依賴 aqutter-js 的契約型別，相依成一條線）。
