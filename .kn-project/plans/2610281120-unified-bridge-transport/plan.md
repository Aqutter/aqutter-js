<!-- REMINDER: Relative Paths Only! No file:///c:/... -->
# Plan: 2610281120 - unified-bridge-transport
- Created: 2026-10-28
- Branch: feature/2610281120-unified-bridge-transport
- Issue: Aqutter/aqutter-js#6
- Milestone: N/A（未指定）
- Base Branch: main
- Status: In Progress
- Completed: [Wait for Finish]

## Goals
1. plugin 作者與網頁端只面對**一種**資料傳輸：`callPlugin`／`onPluginEvent`（以及內建的 `callFlutter`／`onFlutterEvent`），酬載可直接含二進位（`Uint8Array`⇄`Uint8List`），不需選擇通道或 base64。
2. 底層合併為一條多工的本機連線（既有的通用二進位通道），承載呼叫、回應、事件；`callHandler` 只留給取得連線資訊。
3. 移除上一份計畫的 `AqutterPlugin.channels` 與 `openBinaryChannel`（它們被這個統一 API 取代）。
4. 重連、排隊、錯誤碼有明確契約，連線意外中斷時呼叫端能得到確定的結果。

## Architecture
- 現況：網頁→殼用 `window.aqutter.callHandler`（`aqutter-js/src/index.ts:75,294`），殼用 `addJavaScriptHandler` 註冊（`shell/lib/src/bridge/bridge_registry.dart:285`）；殼→網頁用 `evaluateJavascript` 呼叫 `window.__flutterBridgeEmit`（`shell/lib/src/bridge/bridge_emitter.dart:23`、`aqutter-js/src/index.ts:184`）。
- 之後：殼在 `AqutterNativeHost` 註冊通道 `aqutter.rpc`（`aqutter_core` 既有 API），由新的分派器依 `call.name` 找 handler（內建 handler 與 plugin handler 共用同一張表，`supportedPlatforms` 檢查沿用），回 `res`／`err`；事件改由分派器對目前連線送 `evt`。網頁端新增傳輸模組管理連線、排隊與重連，`callFlutter`／`callPlugin` 與事件訂閱改用它。
- 編解碼各自實作於兩端（Dart／TypeScript），以同一組測試向量（二進位檔或十六進位字串）保證一致。
- 實測依據：Android 實機通道小訊息往返 0.29 ms（`callHandler` 約 0.5 ms），1MB 往返 base64 126.5 ms 對通道 11.5 ms（見 `Aqutter/aqutter` 的 `docs/channel-performance.md`）。Windows、iOS、macOS、Linux 尚未用通道量測。

## Cross-Repo Scope
- **本計畫所屬 repo**: `Aqutter/aqutter-js`
- **共用計畫 ID**: `2610281120-unified-bridge-transport`　**共用分支名**: `feature/2610281120-unified-bridge-transport`
- **參與 repo 與職責**（一 repo 一 issue，尚未建立者寫 `待建立`）:
  - `Aqutter/aqutter_core`（底層）— `AqutterRpcHost`：訊框編解碼、`aqutter.rpc` 通道、handler 登錄、分派與 `emit`、錯誤碼。issue: `Aqutter/aqutter_core#6`
  - `Aqutter/aqutter`（契約正本；殼）— 界接：把內建與 plugin handler 登錄到 `AqutterRpcHost`、`supportedPlatforms`、`aqutterError` 轉換、`emit`；移除 `channels`；文件、基準工具、wiki。issue: `Aqutter/aqutter#20`
  - `Aqutter/aqutter-js`（網頁端）— 傳輸層（連線、排隊、重連、訊框編解碼）、`callFlutter`／`callPlugin`／事件改走新傳輸、`onTransportState`、移除 `openBinaryChannel`。issue: `Aqutter/aqutter-js#6`
- **執行順序相依**: 契約凍結後，`aqutter_core` 與 `aqutter-js` 可平行實作（兩端各自寫編解碼並以同一組測試向量驗證）；`aqutter` 依賴 core 的新 API，需等 core 合併且 tag 移動後才能以 git 依賴取得。建議合併順序：`aqutter_core` → `aqutter` → `aqutter-js`，manifest 在三者合併後更新。
- **跨 repo 檔案指涉**: `aqutter-js` 的 `src/contract/bridge.ts` 與 `aqutter` 的 `shell/lib/src/bridge/bridge_names.dart` 成對（名稱不變）；訊框測試向量放在 `aqutter_core` 的 `test/` 並逐字複製到 `aqutter-js` 的 `test/`。

## Contract / 介面契約
- **契約正本 repo**: `Aqutter/aqutter`　**修訂號**: `rev 2`　**狀態**: `凍結（核准日 2026-10-28；rev 2 核准日 2026-10-28）`

### 1. 傳輸
- 網頁與殼之間只有**一條**多工連線：`ws://127.0.0.1:<port>/channel/aqutter.rpc?token=<token>`。底層是 `aqutter_core` 既有的通用二進位通道（`AqutterNativeHost.registerChannel`），多工協定與分派由 `aqutter_core` 的新元件 `AqutterRpcHost` 提供（見 §5）；一次頁面載入一條，承載所有呼叫、回應、事件與二進位。
- 連線資訊的**唯一**取得方式是 `window.aqutter.callHandler('native_endpoint')` → `{ port: int, token: string }`。這是 `callHandler` 路徑上**唯一保留**的 handler；其餘內建 handler 與所有 plugin handler 一律走本連線。
- 鏡像（`/native/<session>`）不受影響，仍是獨立的連線與協定。
- 頁面的 CSP 必須允許 `connect-src ws://127.0.0.1:*`（本計畫後對**所有** App 成為必要條件，不再只限使用鏡像者）。
- 連不上（CSP 擋掉、平台不支援）**沒有備援路徑**：所有等待中的呼叫以 `TRANSPORT_UNAVAILABLE` reject。

### 2. 訊框格式（每個 WebSocket 二進位訊息一個訊框；文字訊息被忽略）
```
frame  = headerLength(u32, big-endian) | header(UTF-8 JSON, headerLength 位元組) | blob_0 | blob_1 | …
header = { "t": <type>, "id"?: <u53>, "name"?: <string>, "ch"?: <string>, "p"?: <json>, "e"?: {"code": <string>, "message": <string>}, "blobs": [<len_0>, <len_1>, …] }
```
| 欄位 | 型別 | 必填 | 說明 |
|---|---|---|---|
| `t` | string | 是 | `call`（網頁→Dart）、`res`、`err`（Dart→網頁，回應 `call`）、`evt`（Dart→網頁，事件）、`part`（雙向，大訊框的一片，見下方「分段」） |
| `id` | 整數 0..2^53-1 | `call`／`res`／`err` 必填 | 由**網頁**配發、連線內不重複；`res`／`err` 回填同一個值 |
| `name` | string | `call` 必填 | handler 名稱：內建為既有名稱（`bridge_names.dart`／`bridge.ts` 的 handler 名），plugin 為 `<pluginId>.<method>` |
| `ch` | string | `evt` 必填 | 事件頻道：內建為既有名稱，plugin 為 `<pluginId>.<event>` |
| `p` | JSON | 否 | 酬載／結果／事件內容；省略等同 `null`（`call` 的 `p` 省略時 handler 收到 `{}`）。可含二進位佔位 |
| `e` | object | `err` 必填 | `code`、`message` 皆為字串 |
| `blobs` | int[] | 是（可為空陣列） | 依序給出每個 blob 的位元組長度；blob 緊接在 header 之後，依序排列，總長必須恰等於訊框剩餘長度 |

- **二進位佔位**：`p` 內任何位置（陣列元素、物件的值）出現 `{"$bin": <i>}` 代表第 `i` 個 blob（0 起算，須 `0 ≤ i < blobs.length`，每個 blob 恰被引用一次）。物件鍵 `$bin` 為保留字，使用者資料**不得**使用。
- **型別對應**：JS `ArrayBuffer`／任何 `ArrayBufferView` 送出，收到時一律是 `Uint8Array`；Dart `Uint8List`（含 `TypedData` 子型別）送出，收到時一律是 `Uint8List`。其他型別維持 JSON 語意（數字、字串、布林、null、陣列、物件）；`undefined` 與函式不可序列化。
- **單一 WebSocket 訊息上限**：≤ 64 MiB（67,108,864 位元組）。
- **分段（自動，使用者不需處理）**：一個邏輯訊框（call／res／err／evt）編碼後 ≤ 64 MiB 時照舊整個送出；超過時，傳輸層把**編碼後的整段位元組**（含 4 位元組長度前綴）依序切成每片 16 MiB（16,777,216 位元組，最後一片較短）的 `part` 訊框送出：
  `header = { "t": "part", "id": <分段訊息編號>, "seq": <0 起算>, "total": <片數 2..32>, "blobs": [<片長>] }`，後接該片位元組作為**唯一**的 blob。
  - 接收端依 `id` 收齊 `seq` 0..`total`-1（必須依序到達）後串接成原訊框，再照常解碼。`id` 在同一方向的連線內不重複（各方向自己配發，與 `call` 的 `id` 是兩個獨立的編號空間）。
  - 邏輯訊框總長 ≤ 512 MiB（536,870,912 位元組，即 `total` ≤ 32）。超過：送出端（網頁）直接 reject `PAYLOAD_TOO_LARGE`；殼回應超過則改回 `err`（`PAYLOAD_TOO_LARGE`）。
  - 同一方向同時進行（尚未收齊）的分段訊息 ≤ 4 個。
- 訊框格式錯誤（長度不符、`blobs` 與佔位對不上、未知 `t`，以及分段違規：片序不連續、`total` 超出 2..32、片長超過 16 MiB 或與 `blobs` 不符、同時進行的分段超過 4 個、分段內容本身又是 `part`、組回後長度超過 512 MiB）：接收端**關閉連線**（close code 1002），不嘗試修復。單一 WebSocket 訊息超過 64 MiB：關閉連線（1009）。

### 3. 呼叫與事件語意
| 項目 | 規則 |
|---|---|
| 呼叫 | `callFlutter(handler, payload)` 與 `callPlugin(id, method, payload)` 簽章不變；內部配發 `id`、送 `call`、等 `res`／`err`。同一連線上多個呼叫可同時進行，殼**並行**處理，回應順序不保證 |
| 回應 | `res.p` 是 handler 的回傳值。handler 回傳含保留鍵 `aqutterError` 的資料（`aqutterErrorPayload` 的結果）時，殼轉成 `err`（`code`、`message` 取自該資料），網頁收到 `AqutterPluginError`；`aqutterErrorPayload` 對 plugin 作者維持可用 |
| 事件 | `emit(event, payload)`、殼內建事件改送 `evt`；網頁的 `onFlutterEvent`／`onPluginEvent` 簽章不變。事件**不**排隊：連線不在時送出的事件直接丟棄，與現況（WebView 未就緒時丟棄）一致 |
| 順序 | 同一端送出的訊框按送出順序到達；殼對同一連線的 `evt` 與 `res` 之間不保證相對順序 |
| 逾時 | 呼叫**沒有**預設逾時（plugin 可能做長時間操作）；連線關閉時所有已送出未回應的呼叫以 `TRANSPORT_CLOSED` reject。要逾時的呼叫端自行處理 |
| 排隊 | 連線尚未建立（或重連中）時發出的呼叫會排隊，連線建立後依序送出；排隊超過 10 秒仍未連上，以 `TRANSPORT_UNAVAILABLE` reject |
| 重連 | 連線意外關閉（含殼 `restart()` 以 1001 關閉、App 回前景）後，網頁端自動重連：重新呼叫 `native_endpoint`（殼重啟後埠與令牌都會變），退避 200 ms 起、每次加倍、上限 5 秒，直到成功。已送出未回應的呼叫**不重送**（可能已有副作用） |
| 傳輸狀態 | 網頁端新增 `onTransportState(listener: (state: 'connecting' \| 'open' \| 'closed') => void): Unsubscribe` 與同步的 `getTransportState()`，讓 App 在重連後自行重新取得需要的狀態（事件不補發） |

### 4. 錯誤碼（`err.e.code`／網頁端 `AqutterPluginError.code`）
| 錯誤碼 | 觸發條件 | 前端預期行為 |
|---|---|---|
| `HANDLER_NOT_FOUND` | `call.name` 沒有對應的 handler | reject，呼叫端視為程式錯誤 |
| `HANDLER_FAILED` | handler 拋出例外；`message` 為例外訊息（不含堆疊） | reject |
| `UNSUPPORTED_PLATFORM` | plugin 宣告了 `supportedPlatforms` 且目前平台不在內（行為與現況相同，改以 `err` 傳遞） | reject；呼叫前可用 `isPluginSupported` 判斷 |
| `PAYLOAD_TOO_LARGE` | 邏輯訊框超過 512 MiB | reject |
| `BAD_FRAME` | 訊框格式錯誤；伴隨連線關閉 | 連線重連，進行中的呼叫 `TRANSPORT_CLOSED` |
| `TRANSPORT_UNAVAILABLE` | 排隊逾時、CSP 擋掉或平台無法建立連線（**僅網頁端產生**） | reject；提示 CSP 需放行 `ws://127.0.0.1:*` |
| `TRANSPORT_CLOSED` | 已送出的呼叫在回應前連線關閉（**僅網頁端產生**） | reject；呼叫端自行決定是否重試 |

### 5. Dart 側介面與保留字
- **`aqutter_core` 提供**（Dart 端型別與能力都在 core）：`AqutterRpcHost.instance`，含 `registerHandler(String name, AqutterRpcHandler handler)`、`unregisterHandler(String name)`、`Future<void> emit(String channel, Object? payload)`、`bool get connected`、訊框編解碼，以及 `typedef AqutterRpcHandler = Future<dynamic> Function(Map<String, dynamic> payload)`。handler 拋出的 `AqutterRpcException(code, message)` 會直接成為 `err`（一般例外為 `HANDLER_FAILED`）。通道名固定為 `aqutter.rpc`。
- **`aqutter`（殼）只做界接**：把內建 handler 與 plugin 的 `handlers` 註冊到 `AqutterRpcHost`、套用 `supportedPlatforms`（不支援時註冊一個丟 `UNSUPPORTED_PLATFORM` 的 handler）、把 `aqutterError` 結果轉成 `AqutterRpcException`、`emit` 轉呼叫 `AqutterRpcHost.emit`。
- `AqutterPlugin.handlers`、`AqutterPluginContext.emit`、`aqutterErrorPayload` 簽章不變；handler 收到的 payload 與回傳值可含 `Uint8List`。
- `AqutterPlugin.channels` 與其輔助函式（`aqutterPluginChannelName`、`aqutterRegisterPluginChannels`、`aqutterUnregisterPluginChannels`）**移除**；網頁端 `openBinaryChannel`、`connectBinaryChannel`、`BinaryChannel` **移除**。二進位直接放在 handler／事件的酬載裡。
- plugin id `aqutter` 為保留字（`aqutter.rpc` 通道名使用它）；殼在組裝期遇到會拋出 `ArgumentError`，與現有的 id 驗證同一處。
- 網頁端移除 `window.__flutterBridgeEmit`；殼端移除以 `evaluateJavascript` 派送事件的做法與 `addJavaScriptHandler` 對內建／plugin handler 的註冊（`native_endpoint` 除外）。

### 6. 相容性
- 鏡像的連線路徑、協定、令牌不變；`/channel/<name>` 通用通道 API 維持，`aqutter.rpc` 是它的一個使用者。
- `callFlutter`／`callPlugin`／`onFlutterEvent`／`onPluginEvent` 的 TypeScript 簽章不變；既有 plugin 的 Dart 程式與網頁端程式**不需修改**。
- 開發階段，**不**保留舊傳輸（`callHandler` 呼叫 handler、`__flutterBridgeEmit`）的相容層；舊版網頁包搭配新版殼（或反之）不能運作，版本須成對（以 manifest 為準）。

### 7. 變更紀錄
- 2026-10-28 rev 2：新增 `part` 訊框與自動分段，邏輯訊框上限由 64 MiB 提高到 512 MiB（單一 WebSocket 訊息仍 ≤ 64 MiB，≤ 64 MiB 的訊框行為不變）。原因：使用者要求框架自動處理大資料。影響：`aqutter_core`、`aqutter-js`（編解碼與重組）、`aqutter`（僅文件）。

## Impact Files
- `src/index.ts:19,45,67-79`（`AqutterBridge`、`getFlutter`、`callFlutter`）、`:177-195`（`ensureEmitter`／`__flutterBridgeEmit`）、`:199-210`（`onFlutterEvent`）、`:288-300`（`callPluginRaw`）、`:312-322`（`onPluginEventRaw`）— 改用新傳輸；`callHandler` 只用於 `native_endpoint`。
- `src/transport.ts` (new) — 連線管理（取得連線資訊、連線、排隊 10 秒、指數退避重連、`onTransportState`／`getTransportState`）。
- `src/frame.ts` (new) — 訊框編解碼與 `$bin` 佔位（與殼的 `rpc_codec.dart` 成對）。
- `src/channel.ts`、`test/channel.test.ts` — **移除**（被統一 API 取代）；`src/index.ts` 的 `export * from './channel'` 移除。
- `test/frame.test.ts` (new)、`test/transport.test.ts` (new)、`test/pluginError.test.ts:6`（原本 stub `window.aqutter.callHandler`）— 改為對新傳輸的假連線測試。
- `src/nativeview/element.ts:146`（`resolveEndpoint: callFlutter(BridgeHandler.NativeEndpoint)`）— 取得連線資訊的路徑維持 `callHandler`。
- `README.md`、`.kn-project/project.md` — 說明與保留鐵則。

## Open Questions / 待確認事項
> 以下項目皆已在對話中確認。

### Q1. 內建 handler（約 30 個）是否一併改走新傳輸？ — 影響範圍：三個 repo
- [x] 全部改走，只留 `native_endpoint` 在 `callHandler`　(建議)
- [ ] 只改 plugin，內建維持 `callHandler`
- **決議**：全部改走（使用者先確認開發介面不變、擴充 plugin 仍同樣簡單後選擇）　狀態：✅ 已確認

### Q2. 驗證不過的平台怎麼辦？ — 影響範圍：整個計畫
- **決議**：Linux 由 agent 用 WSL2（Debian 13）測；iOS、macOS 暫緩，等使用者用 Mac 測；失敗時的處理等結果出來再決定，現在不預設，也不排除全面統一。　狀態：✅ 已確認

### Q3. 重連期間的事件 — 影響範圍：契約 §3
- [x] 不補發，提供 `onTransportState` 讓 App 自行重新取得狀態　(建議)
- **決議**：不補發　狀態：✅ 已確認

### Q4. 呼叫逾時 — 影響範圍：契約 §3
- [x] 不設預設逾時，連線關閉時 reject `TRANSPORT_CLOSED`　(建議)
- **決議**：不設預設逾時　狀態：✅ 已確認

### Q5. 訊框上限 — 影響範圍：契約 §2
- [x] 64 MiB　(建議)
- **決議**：64 MiB　狀態：✅ 已確認

## Manual Follow-ups / 人工收尾事項
- **[合併後]** 在 iOS、macOS 驗證本機 WebSocket 通道可用（`tools/channel-bench`，或任一使用鏡像／通道的 App）— 由使用者用 Mac 驗證；失敗時的處理屆時再決定 — 需要 Mac 與 iOS 裝置，agent 沒有（Linux 由 agent 以 WSL2 驗證，不在此列）
- **[合併後]** 既有 App 的網頁 CSP 補上 `connect-src ws://127.0.0.1:*` — 本計畫後所有 App 必須放行；範本專案 `aqutter-nuxt-app` 已放行，其他專案需自行檢查 — 屬各專案自己的網頁設定
- **[合併後]** 更新 manifest 的 `shell.ref`／`client.spec`、移動兩個 repo 的 `0.0.0` tag、同步 `aqutter-cli` 快照、範本專案 `aqutter upgrade` — 沿用先前流程 — 對外動作，需使用者核准

## Key Decisions
- **[Phase 0]** 整合主幹 `main`；本計畫涉及 `aqutter_core`、`aqutter`、`aqutter-js` 三個 repo，milestone 皆不指定，base 為 `main`（沿用上一份計畫的決定，本次未重新詢問 core——使用者在上一輪已對三個 repo 回答「不指定」，見下一行）。
- **[方向]** 使用者要求：plugin 擴充者與使用 Flutter⇄Web 通道的人「不要有太多選擇」——通道若是最優解就不該有其他選擇。因此合併成單一傳輸，不並存兩套 API。
- **[Q1]** 內建 handler 全部改走新傳輸，只留 `native_endpoint` 在 `callHandler`（使用者確認開發介面不變後選擇）。
- **[Q2]** Linux 由 agent 以 WSL2 驗證；iOS、macOS 由使用者用 Mac 驗證；驗證失敗的處理屆時再決定，不預設也不排除全面統一。
- **[Q3]** 重連期間的事件不補發，提供 `onTransportState`。
- **[Q4]** 呼叫不設預設逾時。
- **[Q5]** 訊框上限 64 MiB（rev 1）。
- **[契約變更]** rev 1 → 2：新增 `part` 訊框與自動分段，邏輯訊框上限 512 MiB（原因：使用者要求框架自動處理大資料，2026-10-28 核准）。
- **[契約]** rev 1 凍結（2026-10-28）。
- **[完成後]** commit + 開 PR（併回 `main`；使用者核准時未更動預設）。
- **[執行模式]** 序列（依據：aqutter 依賴 core 的新 API，且環境不保證子 agent 能各自驗證；順序 aqutter_core → aqutter-js → aqutter）。
- **[分層]** Dart 端程式碼與介面由 `aqutter_core` 提供，`aqutter` 只做界接（使用者先前指示，沿用）。
- **[前置]** 上一份計畫 `2610271034-binary-channel-and-channel-benchmarks` 已在三個 repo 補歸檔（PR `Aqutter/aqutter#19`、`Aqutter/aqutter_core#5`、`Aqutter/aqutter-js#5`）。


## Git Completion Policy
- PR 一律以 `--base main` 顯式指定 base。
- Issue 建立後，每個 commit 訊息與 PR body 含 `Closes #<N>`；歸檔後張貼結案留言，issue 在合併後清理時關閉。
- commit 自動；完成後的動作於核准閘決定。
- 跨 repo 時各自開自己的 PR；建議合併次序見 `## Cross-Repo Scope`。

## References
- 上一份計畫的歸檔：`.kn-project/archive/2610271034-binary-channel-and-channel-benchmarks.md`
