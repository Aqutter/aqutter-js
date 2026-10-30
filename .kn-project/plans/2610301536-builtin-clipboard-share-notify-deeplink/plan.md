<!-- REMINDER: Relative Paths Only! No file:///c:/... -->
# Plan: 2610301536 - builtin-clipboard-share-notify-deeplink
- Created: 2026-10-30
- Branch: N/A（project.md：開發階段直接推 main）
- Issue: N/A（不建 issue）
- Milestone: N/A（未指定）
- Base Branch: main
- Status: In Progress
- Completed: [Wait for Finish]

## Goals
在客戶端契約加入殼新增的八個 handler 與兩個事件（剪貼簿、分享、本機通知、深層連結），讓網頁以型別安全的 `callFlutter`／`onFlutterEvent` 使用；契約正本在 `aqutter` 的同名計畫。

## Architecture
1. 在 `BridgeHandler` 與 `BridgeEvent` enum 加入新名稱，字串與殼的 `bridge_names.dart` 逐字相同。
2. 在 `contract/bridge.ts` 加入請求、回應與事件酬載的介面（欄位、可空、限制依契約）；`contract/table.ts` 把 handler 對應到型別，事件同理。
3. 不新增執行期程式碼：呼叫與訂閱沿用既有的 `callFlutter`、`isBridgeSupported`、`onFlutterEvent`。
4. 測試：新名稱都出現在對照表（沿用既有的契約對照測試的做法，Phase 3 確認該測試位置）。

遵守 `kn-project-code-style`（TypeScript 慣例沿用既有檔案）。

## Cross-Repo Scope
- **共用計畫 ID**: `2610301536-builtin-clipboard-share-notify-deeplink`　**共用分支名**: `N/A（直接 main）`
- **本計畫所屬 repo**: `aqutter-js`
- **參與 repo 與職責**:
  - `aqutter` — 殼端實作與契約正本　issue: `N/A`
  - `aqutter-js` — 契約型別與名稱　issue: `N/A`
  - `aqutter-cli` — 範本設定　issue: `N/A`
- **執行順序相依**: 契約凍結後三者平行；本 repo 完成並移動 tag `0.0.0` 後，`aqutter` 才更新 manifest 的 `client.spec`。
- **跨 repo 檔案指涉**: `aqutter`：`shell/lib/src/bridge/bridge_names.dart`（名稱必須逐字相同）。

## Contract / 介面契約
- **契約正本 repo**: `aqutter`　**修訂號**: `rev 2`　**狀態**: `凍結（rev 2，核准日 2026-10-30；rev 1 同日凍結）`

### 1. Handler（網頁 → 殼；名稱兩端成對：殼的 `BridgeHandler` 與 `aqutter-js` 的 `BridgeHandler` enum）
| # | 名稱 | 請求 | 回應 | 平台（列入 capabilities 的條件） |
|---|---|---|---|---|
| 1 | `clipboard_read` | 無 | `{ text: string \| null }`（剪貼簿沒有文字為 null） | 全部 |
| 2 | `clipboard_write` | `{ text: string }` | `{ ok: true }` | 全部 |
| 3 | `share_open` | `{ text?: string, url?: string, subject?: string, files?: ShareFile[] }`，`text`、`url`、`files` 至少一個有內容；`ShareFile` ＝ `{ name: string, mimeType?: string, data: Uint8Array }` | `{ status: 'shared' \| 'dismissed' \| 'unavailable' }` | 全部 |
| 4 | `notify_show` | `{ id?: int, title: string, body?: string, payload?: string }` | `{ id: int }` | Android、iOS、macOS |
| 5 | `notify_schedule` | 同 `notify_show`，另加必填 `atMs: int`（epoch 毫秒） | `{ id: int }` | Android、iOS、macOS |
| 6 | `notify_cancel` | `{ id?: int }`（省略＝取消全部） | `{ ok: true }` | Android、iOS、macOS |
| 7 | `notify_initial` | 無 | `{ id: int \| null, payload: string \| null }`（點通知而冷啟 App 時有值，否則兩者皆 null） | Android、iOS、macOS |
| 8 | `deeplink_initial` | 無 | `{ url: string \| null }`（啟動 App 的連結；同一個程序內重複呼叫回傳相同值） | Android、iOS、macOS |
| 9 | `clipboard_read_image` | 無 | `{ image: { mimeType: 'image/png', data: Uint8Array } \| null }`（剪貼簿沒有圖片為 null；一律以 PNG 回傳） | Android、iOS、macOS、Windows |
| 10 | `clipboard_write_image` | `{ data: Uint8Array, mimeType?: string }`（PNG 或 JPEG，省略視為 `image/png`） | `{ ok: true }` | Android、iOS、macOS、Windows |

### 2. 事件（殼 → 網頁）
| 名稱 | 酬載 | 觸發 |
|---|---|---|
| `notify_tapped` | `{ id: int, payload: string \| null }` | App 在執行中（前景或背景）使用者點了通知 |
| `deep_link` | `{ url: string }` | App 在執行中收到新的連結；**啟動 App 的那一個連結不走事件**，只由 `deeplink_initial` 取得 |

### 3. 欄位限制
| 欄位 | 型別 | 限制 |
|---|---|---|
| `clipboard_write.text` | string | 長度 ≤ 1,000,000（UTF-16 單元） |
| `share_open.text`／`url`／`subject` | string | 各 ≤ 10,000；`url` 不檢查格式，由系統分享面板處理 |
| `share_open.files` | ShareFile[] | 最多 5 個；每個 `data` ≤ 5,242,880 位元組；`name` 必須是單一檔名（不含路徑分隔、不為 `.`／`..`、≤ 128 字，與下載檔名規則相同）；`mimeType` 省略時依副檔名判斷，判斷不出來用 `application/octet-stream` |
| `clipboard_write_image.data` | Uint8Array | ≤ 5,242,880 位元組，必須是 PNG 或 JPEG |
| `clipboard_read_image` 回傳 | PNG | 超過 5,242,880 位元組回錯誤 `too_large`，不截斷 |
| `notify_*.id` | int | 32 位元有號整數；省略時由殼配發（遞增，從 1 起，程序內不重複）；同一個 id 再次顯示／排程會取代原通知 |
| `notify_*.title` | string | 1–200 字，必填 |
| `notify_*.body` | string | ≤ 2,000 字，省略視為空 |
| `notify_*.payload` | string | ≤ 1,000 字；殼原樣帶回，不解讀 |
| `notify_schedule.atMs` | int | 必須大於目前時間，否則錯誤 `invalid_argument`；以絕對時間點排程，不受時區影響 |

### 4. 錯誤碼（以 `aqutterError` 回傳，網頁端拋 `AqutterPluginError` 相同形態的錯誤）
| 錯誤碼 | 觸發條件 | 前端預期行為 |
|---|---|---|
| `invalid_argument` | 欄位缺漏、型別錯、超過上限、`atMs` 已過 | 修正參數；不重試 |
| `too_large` | 剪貼簿裡的圖片超過上限（`clipboard_read_image`）| 改用較小的圖片；不要重試 |
| `permission_denied` | `notify_show`／`notify_schedule` 時系統通知權限未授權 | 先以既有 `perm_request`（`notifications`）取得權限；永久拒絕時引導到系統設定 |

### 5. 行為規則
- **權限不自動彈出**：`notify_*` 不會自己跳授權視窗；網頁先用既有的權限 handler 處理（權限一律經殼）。
- **排程為非精確**：Android 以不需要精確鬧鐘權限的方式排程，系統可能延後數分鐘；需要準時請另案。
- **通知樣式**：rev 1 只有標題、內文與 payload；Android 使用單一預設頻道（id `aqutter_default`，名稱「通知」），圖示用 App 的啟動圖示。
- **深層連結的設定屬於各 App**：自訂 scheme、App Links、Universal Links 的宣告在各 App 的原生專案，殼只負責收到後轉給網頁；網頁必須自行驗證收到的連結再導航，殼不過濾。
- **剪貼簿**：文字與圖片各有 handler；讀取是明確的 handler 呼叫，沒有背景監聽。圖片剪貼簿由殼自己的原生程式實作（殼套件本身是 Flutter plugin，不依賴外部套件），App 不需要改原生專案；Android 的 provider 由殼的 manifest 自己宣告。Linux 不支援圖片剪貼簿（不列入能力表，呼叫回 `UNSUPPORTED_PLATFORM`）。
- **分享檔案**：殼把 `files` 暫存到暫存目錄（每次分享一個獨立資料夾）交給系統分享面板，分享結束後盡力刪除；殼不修改檔案內容。分享圖片時 `mimeType` 請給 `image/png`／`image/jpeg`，系統才會用圖片的方式處理。
- **不支援的平台**：handler 不列入 `platform_info` 的 capabilities（網頁用 `isBridgeSupported` 判斷）；被呼叫時回 `aqutterError`（`UNSUPPORTED_PLATFORM`）。

### 6. 相容性
- 只新增 handler、事件與選填欄位，既有名稱與行為完全不變；rev 1 的網頁不受影響（`share_open` 不帶 `files` 時行為與 rev 1 相同）。
- 舊版殼收到這些 handler 名稱會回 handler not found；網頁端以 `isBridgeSupported` 先判斷。

### 7. 變更紀錄
- **rev 2（2026-10-30，已核准凍結）**：`share_open` 新增選填 `files`；新增 `clipboard_read_image`、`clipboard_write_image`；新增錯誤碼 `too_large`。原因：使用者要求分享與剪貼簿支援圖片（以 LOGO 做展示）。影響：`aqutter`（殼套件加入 Android／iOS／macOS／Windows 的原生程式；`share_open` 的檔案沿用既有的 `share_plus`）、`aqutter-js`（型別）、`aqutter-cli`（無範本變更）。決議：不引入外部剪貼簿套件，由框架自己實作；範圍為 Android、iOS、macOS、Windows，Linux 不做。

## Impact Files
- `src/contract/bridge.ts:77`（`BridgeHandler`，`OpenerOpen` 附近）與事件 enum — 新增八個 handler、兩個事件名稱
- `src/contract/bridge.ts:321` 之後 — 新增請求、回應、事件酬載介面
- `src/contract/table.ts:135`（`OpenerOpen` 條目附近）— 新增 handler 與事件的型別對應
- `test/bridgeCapabilities.test.ts` 或新增測試檔 — 名稱與對照表的一致性（Phase 3 確認位置）
- `README.md`／docs — 若列有 handler 清單則補上（Phase 3 確認）

## App-Flow Screens
- （無 app-flow.json，刪除本節）

## Open Questions / 待確認事項
### Q1. 作業流程 — 影響範圍：分支與 issue
- [x] 直接 main、不建 issue　(建議，理由：`project.md` 規定開發階段直接推 main)
- **決議**：直接 main、不建 issue　狀態：✅ 已確認

## Manual Follow-ups / 人工收尾事項
- **[合併後]** 通知 `aqutter` 更新 manifest 的 `client.spec`（由 `aqutter` 的計畫處理）— 無需人工操作

## Key Decisions
- **[範圍]** 剪貼簿、分享、本機通知、深層連結；推播、生物辨識、安全儲存、分享檔案不做 — 理由：先做不需要外部服務的常用能力（使用者決議）。
- **[位置]** 內建在殼的 bridge，不做成 plugin — 理由：使用者決議；代價是每個 App 都帶這些依賴，殼變大。
- **[分享範圍]** rev 1 只分享文字與網址，不含檔案 — 理由：檔案牽涉暫存與檔案權限，另案。
- **[排程]** 非精確排程、以絕對時間點 — 理由：避免精確鬧鐘權限與時區相依；需要準時另案。
- **[權限]** 通知 handler 不自動跳授權 — 理由：權限一律經殼既有的權限 handler，行為一致。
- **[啟動連結]** 啟動 App 的連結只由 `deeplink_initial` 取得，不走事件 — 理由：事件在網頁未連線時會被丟棄，冷啟必須有可重複讀取的來源。
- **[流程]** 直接 main、不建 issue（Q1）；**[契約]** rev 1 凍結（2026-10-30 核准）。
- **[完成後]** 預設「只 commit」，push 與移動 tag 依使用者之後的明確要求（待核准閘確認，Rule 16 不沿用）。
- **[契約]** rev 2 凍結（2026-10-30 核准，Rule 29）：分享檔案、圖片剪貼簿、錯誤碼 too_large。
- **[套件]** 圖片剪貼簿由框架自己實作、不引入外部套件（使用者決議）：殼套件宣告為 Flutter plugin，含 Android、iOS、macOS、Windows 的原生程式；Linux 不做。iOS、macOS 沒有裝置可編譯驗證（使用者已知並同意範圍）。

## Git Completion Policy
- 直接 main：commit 自動；push 與移動 tag `0.0.0` 依使用者明確要求。
- 跨 repo 各自 commit；建議次序：`aqutter-js` 先推並移 tag，再更新 `aqutter` 的 manifest。

## References
- 本次對話的框架審查結果（缺少剪貼簿、分享、通知、深層連結）
