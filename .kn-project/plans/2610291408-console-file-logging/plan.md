<!-- REMINDER: Relative Paths Only! No file:///c:/... -->
# Plan: 2610291408 - console-file-logging
- Created: 2026-10-29
- Branch: N/A（直接 main，已確認）
- Issue: N/A（使用者決議不建 issue）
- Milestone: N/A（未指定；project.md 開發階段不開 milestone）
- Base Branch: main
- Status: In Progress
- Completed: [Wait for Finish]

## Goals
讓 JS 端的 `console.*` 輸出可由設定決定寫到 devtools、檔案或兩者；release 版可關閉 devtools 輸出以免多餘負擔。並新增 `console.to.<level>(target, ...args)`，由呼叫端指定檔案的 provider（App 內部／文件／快取／暫存／Android 外部目錄）、子路徑與檔名。能力放在 `aqutter-js` SDK（框架中立），殼只負責安全地落地；`aqutter-nuxt-app` 僅是範例接線。

## Architecture
- 新增 `src/console.ts`：`installConsoleLog` 以保存原始 `console.*` 後覆寫；每次呼叫依 `devtools`／`file` 決定是否呼叫原函式、是否送 `callFlutter(BridgeHandler.LogAppend, { level, message, target })`。`console.to` 掛在全域 `console` 上，並以 `declare global { interface Console { to: ConsoleTo } }` 提供型別。
- 寫檔走單一 Promise 鏈串行，失敗吞掉並依錯誤代碼只提示一次（用保存的原始 console，避免遞迴）。
- 契約型別放 `src/contract/bridge.ts`（跨語言成對，對應 `Aqutter/aqutter` 的 `bridge_names.dart` 與 log handler）。

## Cross-Repo Scope
- **本計畫所屬 repo**: `aqutter-js`
- **共用計畫 ID**: `2610291408-console-file-logging`　**共用分支名**: N/A（直接 main）
- **參與 repo 與職責**:
  - `aqutter-js` — 契約型別與 `installConsoleLog`／`console.to`　issue: `待建立`
  - `aqutter` — 殼的 `LogService.append` 支援 `target`、路徑驗證與 provider 解析　issue: `待建立`
  - `aqutter-nuxt-app` — 範例 App 接線，`useAppLog` 避免重複寫檔　issue: `待建立`
- **執行順序相依**: aqutter-js（契約）→ aqutter（殼；之後更新 `manifest/releases.json` 的 `client.spec` 為 aqutter-js 的 commit sha）→ aqutter-nuxt-app（`aqutter upgrade` 後接線）。
- **跨 repo 檔案指涉**: 無。

## Contract / 介面契約
- **契約正本 repo**: `aqutter-js`　**修訂號**: `rev 1`　**狀態**: `凍結（核准日 2026-10-29）`

### 1. 介面
| # | 項目 | 說明 |
|---|---|---|
| 1 | bridge handler `log_append`（名稱不變） | 請求新增選填欄位 `target`；缺省時行為與現況完全相同（寫入 `internal` 的 `logs/` 目錄、檔名 key 取 `log_set_key` 設定值，預設 `app`） |
| 2 | JS API `installConsoleLog(options?)` | 於 `@aqutter/aqutter` 匯出；攔截 `console.debug/log/info/warn/error`，並新增 `console.to.{debug,log,info,warn,error}(target, ...args)`；回傳 `uninstall()` |
| 3 | JS API `isConsoleLogInstalled()` | 供 App 層避免重複寫檔（例如 nuxt-app 的 `useAppLog`） |

### 2. 欄位
**`LogAppendRequest`**（`@aqutter/aqutter/contract`）
| 欄位 | 型別 | 必填 | 預設值 | 限制 | 序列化 |
|---|---|---|---|---|---|
| `level` | `LogLevel`（`debug`/`info`/`warn`/`error`） | 是 | 無 | 列舉 | 一律輸出 |
| `message` | `string` | 是 | 無 | 單筆 ≤ 64 KiB（JS 端截斷並加 `…[truncated]`） | 一律輸出 |
| `target` | `LogTarget` | 否 | 省略 | 見下 | 省略時不輸出 |

**`LogTarget`**
| 欄位 | 型別 | 預設值 | 限制 |
|---|---|---|---|
| `provider` | `LogProvider` | `internal` | 列舉：`internal`＝`getApplicationSupportDirectory()`（現況）、`documents`＝`getApplicationDocumentsDirectory()`、`cache`＝`getApplicationCacheDirectory()`、`temp`＝`getTemporaryDirectory()`、`external`＝`getExternalStorageDirectory()`（僅 Android；App 專屬外部目錄，不需權限） |
| `dir` | `string` | `logs` | 相對路徑、以 `/` 分段；每段 `[A-Za-z0-9._-]+` 且不得為 `.`／`..`；最多 8 段、總長 ≤ 128 |
| `name` | `string` | 目前的 log key（`log_set_key`，預設 `app`） | `[A-Za-z0-9._-]{1,64}` |

實際檔案：`{provider 根目錄}/{dir}/{name}_{yyyyMMdd}.log`（日期為本地時間，跨午夜換檔）。每行格式不變：`{ISO8601} [{level}] {message}\n`，追加寫入並 flush。

**`console.to.<level>(target, ...args)`**：`target` 為 `LogTarget`，或字串（等同 `{ name: 字串 }`）；`...args` 同原生 console，序列化規則：字串原樣、`Error` 取 `stack ?? message`、其他以 JSON（循環參照以 `[Circular]` 取代；失敗退回 `String(x)`），以單一空格連接；含換行時整筆仍為一行，換行以 `\n` 字面轉義。`console.to.log` 的層級為 `info`。

**`installConsoleLog(options)`**
| 欄位 | 型別 | 預設值 | 說明 |
|---|---|---|---|
| `devtools` | `boolean` | `true` | `false` 時**不呼叫**原生 console（release 不輸出到 devtools，避免額外負擔）；SDK 不判斷 dev／release，由 App 傳入（Nuxt：`import.meta.dev`） |
| `file` | `boolean \| { minLevel?: LogLevel }` | `true` | 是否經 bridge 寫檔；`minLevel` 預設 `debug` |
| `target` | `LogTarget` | `{}`（走 bridge 預設） | 一般 `console.*` 使用的目標 |

### 3. 錯誤
| 代碼（訊息前綴） | 觸發條件 | JS 端行為 |
|---|---|---|
| `log_invalid_target` | `dir`／`name` 不符限制 | 該筆不寫檔；每個代碼在每個頁面載入只向原生 console 提示一次 |
| `log_provider_unavailable` | provider 在本平台不可用（如非 Android 用 `external`、取不到目錄） | 同上；**不**自動改寫到其他 provider |

### 4. 狀態與規則
- 寫檔為 fire-and-forget，但同一頁面內以單一 Promise 鏈串行送出，保證順序；寫檔失敗永不丟出到呼叫端。
- 非 Flutter（`isFlutter()` 為 false）或 SSR：不寫檔；`devtools` 設定照常生效；SSR 下 `installConsoleLog` 為 no-op。
- `list/read/write/remove/dir` handler 維持只針對預設 `internal/logs`，不涵蓋 `target` 指到的其他位置（v1 範圍）。

### 5. 相容性
- 舊版 JS 不帶 `target` 的 `log_append` 行為不變；舊殼收到帶 `target` 的請求會忽略它並寫入預設位置（Dart 端以 `payload['target']` 選讀）。
- 新增 `LogProvider` 列舉與 `LogAppendRequest.target`，對既有消費方為純新增。

### 6. 變更紀錄
- _(尚無)_

## Impact Files
- `src/contract/bridge.ts:133` (`LogLevel`) — 其後新增 `LogProvider` 列舉與 `LogTarget`；`:228` (`LogAppendRequest`) 新增選填 `target`
- `src/contract/table.ts:116` (`BridgeHandler.LogAppend`) — 契約表型別沿用 `LogAppendRequest`，確認無需改動（若型別推導需要才動）
- `src/console.ts` (new) — `installConsoleLog`、`isConsoleLogInstalled`、`console.to`
- `src/index.ts:282` (`export * from './nativeview'`) — 新增 `export * from './console'`
- `test/console.test.ts` (new) — 攔截、devtools 開關、序列化、`to.*`、串行與錯誤處理

## App-Flow Screens
（無 app-flow.json）

## Open Questions / 待確認事項
### Q1. 是否 3 個 repo 都直接 commit 到 `main`（project.md 規定），並各建一張 GitHub issue？ — 影響範圍：流程
- [x] 直接 main、不建 issue
- [ ] 直接 main、各建一張 issue
- **決議**：直接 main、不建 issue　狀態：✅ 已確認

## Manual Follow-ups / 人工收尾事項
- **[上線前]** Android／iOS 實機驗證 `external`、`documents` provider 的落檔位置與可讀性 — 以範例 App 呼叫 `console.to.log({ provider: 'external', dir: 'sync', name: 'order' }, 'x')` 後用裝置檔案瀏覽或 adb 檢查 — agent 無實機

## Key Decisions
- **[範圍]** 能力在 aqutter-js、nuxt-app 僅範例 — 理由：使用者明示（nuxt-app 只是範例）。
- **[Provider]** `internal`（預設）／`documents`／`cache`／`temp`／`external`（僅 Android）— 理由：對應 path_provider 既有 API，不需額外權限。
- **[安全]** `dir`／`name` 只允許相對安全字元、禁止 `..` 與絕對路徑，provider 不可用時報錯不改寫 — 理由：避免 JS 任意寫檔；只有一種合理作法。
- **[v1 範圍]** 不攔 `window.onerror`／`unhandledrejection`，`list/read/remove` 不涵蓋自訂 target — 理由：控制範圍，需要時另開計畫。
- **[release]** SDK 不判斷環境，`devtools` 由 App 傳入 — 理由：SDK 框架中立（project.md 保留鐵則），Nuxt 用 `import.meta.dev`。

## Git Completion Policy
- 開發階段直接推送 `main`；commit 自動；不開 PR；歸檔依 Rule 13。
- 跨 repo 時各自 commit，不存在跨 repo 單一 PR (Rule 19)。

## References
- `useAppLog`／`useAppLogger`（aqutter-nuxt-app）、`LogService`（aqutter）為現況實作。
- **[Q1]** 直接 main、不建 issue — 理由：符合 project.md；使用者於核准閘選定。
- **[契約]** rev 1 凍結（2026-10-29）。
- **[完成後]** 只 commit（不 push、不 PR、不歸檔）— 理由：核准閘選項為直接 main、不開 PR；push 待使用者另行要求。
- **[執行模式]** 序列（依據：三 repo 相依成一條線，且無法確認可派出獨立子 agent）。
