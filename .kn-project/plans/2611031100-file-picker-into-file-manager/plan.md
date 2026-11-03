<!-- REMINDER: Relative Paths Only! No file:///c:/... -->
# Plan: 2611031100 - file-picker-into-file-manager
- Created: 2026-11-03
- Branch: N/A（直接推送 `main`）
- Issue: N/A（本專案開發階段不建 issue）
- Milestone: N/A（未指定）
- Base Branch: main
- Status: Awaiting Archive
- Completed: [Wait for Finish]

## Goals
在契約型別把內建 `picker_pick` 相關的列舉值與介面標記為棄用，指引改用 `file-manager` 的 `pick`；行為不變。

## Architecture
只加 `@deprecated` JSDoc，不改任何執行行為，也不移除匯出。

## Cross-Repo Scope
- **本計畫所屬 repo**: `aqutter-js`
- **共用計畫 ID**: `2611031100-file-picker-into-file-manager`　**共用分支名**: 無（直接 `main`）
- **參與 repo 與職責**:
  - `aqutter-plugins` — file-manager 新增 `pick`（契約提供方）　issue: N/A
  - `aqutter-js` — 契約型別將內建 `picker_pick` 標記棄用　issue: N/A
  - `aqutter-nuxt-app` — 示範頁改用 `fileManager.pick`、移除內建 picker composable　issue: N/A
- **執行順序相依**: `aqutter-plugins` 先（可實機驗證 `pick`），`aqutter-js` 與 `aqutter-nuxt-app` 之後（nuxt-app 需要 plugin 新 commit）。
- **跨 repo 檔案指涉**: 無
- **不在本計畫**: 殼 `aqutter` 移除 `file_picker` 依賴與 `picker_pick` 處理器——破壞性變更，等棄用版本發佈後另案。

## Contract / 介面契約
- **契約正本 repo**: `aqutter-plugins`　**修訂號**: `rev 1`　**狀態**: `草擬`

### 1. 方法
| # | 位置 | 名稱 | 用途 |
|---|---|---|---|
| 1 | plugin `file-manager` | `pick` | 開系統選擇器，一次性挑選一或多個檔案；不持久保存、不進授權清單 |

### 2. 請求與回應欄位
**#1 請求** `{ kind: 'file' | 'files', extensions?: string[], title?: string }`
| 欄位 | 型別 | 必填 | 預設 | 限制 |
|---|---|---|---|---|
| `kind` | `'file'` \| `'files'` | 是 | 無 | 其他值回 `invalid_argument`；資料夾不走本方法，仍用 `grant('directory')` |
| `extensions` | `string[]` | 否 | 不限 | 不含點、不分大小寫，如 `['pdf','png']`；空陣列視為不限 |
| `title` | `string` | 否 | 系統預設 | 只在平台支援時作為選擇器標題 |

**#1 回應** `{ items: PickedFile[] }`，取消回 `items: []`
| 欄位 | 型別 | 說明 |
|---|---|---|
| `location` | `string` | `picked:<編號>`；網頁看不到實際路徑 |
| `name` | `string` | 檔名（含副檔名） |
| `size` | `number` | 位元組；取不到時省略 |

### 3. 錯誤碼
| 錯誤碼 | 觸發條件 | 網頁預期行為 |
|---|---|---|
| `invalid_argument` | `kind` 不合法、`extensions` 不是字串陣列 | 屬開發錯誤，直接拋出 |
| `permission_denied` | 對 `picked:` 位置做讀以外的操作（write／delete／move／copy 目的端） | 拋出 `AqutterPluginError` |
| `not_found` | `picked:<編號>` 已失效（App 重啟或檔案被移除） | 重新呼叫 `pick` |

### 4. 狀態與規則
- `picked:<編號>` 只在本次 App 執行期間有效，不寫入持久儲存；App 重啟後失效。
- `picked:` 位置只能讀：`stat`、`read`、`copy` 的來源端；其他操作一律 `permission_denied`。
- Android：選到的是 `file_picker` 複製進 App 快取的檔案；桌面：選到的是原路徑。兩者對網頁都只是 `picked:<編號>`。
- 平台不支援時依「不支援平台不拋錯」契約，`callPlugin` 回 `undefined`，網頁端 `fileManager.pick` 回 `[]`。
- 取消選取回 `items: []`，不是錯誤。

### 5. 相容性
- 既有 `grant`／`grants`／`revoke` 與位置字串（`app-*:`、`granted:`）完全不變；本契約只新增方法與 `picked:` 位置。
- 內建 bridge `picker_pick` 本計畫只標記棄用，行為不變；移除另案。

### 6. 變更紀錄
- _(尚無)_

## Impact Files
- `src/contract/bridge.ts:85`（`PickerPick`）、`:439-447`（`PickerRequest`／`PickerResponse`）— 加 `@deprecated`
- `src/contract/table.ts:139`（`PickerPick` 對應表）— 只需確認棄用提示不破壞型別
- `src/contract/models/filePicker.ts`（`FilePickerMode`、`FilePickerOptions`）— 加 `@deprecated`
- `.kn-project/wiki/*` 中提到檔案選擇橋接的頁面 — 同步說明（需先 grep 確認）

## Open Questions / 待確認事項
無（已拍板，見 Key Decisions）

## Manual Follow-ups / 人工收尾事項
- 無（這是純程式碼與文件變更）

## Git Completion Policy
- 本 repo 開發階段直接推送 `main`，不開 PR、milestone、版本分支（見 `.kn-project/project.md`）。commit 一律自動（Rule 17）；完成後依核准閘選項 push。
- 跨 repo：各 repo 自己 commit／push，不存在跨 repo 單一變更；合併次序見 `## Cross-Repo Scope`。
- 程式碼遵守 `kn-project-code-style`（TypeScript／Vue 規則；Dart 沿用該 repo 既有風格）。

## Key Decisions
- **[Q1]** 新增一次性 `pick`，`grant` 不變 — 理由：`grant` 在 Android 只支援資料夾（`aqutter-plugins/packages/file-manager/lib/src/grants.dart` SafGrantPicker 對非 directory 拋不支援），且會持久保存授權；一次性選檔不該進授權清單。使用者 2026-11-03 選擇此方案。
- **[Q2]** 本輪不動殼 — 理由：移除 `picker_pick` 是對所有現有 App 的破壞性變更，先棄用、下一版再移除。

## References
- 無
