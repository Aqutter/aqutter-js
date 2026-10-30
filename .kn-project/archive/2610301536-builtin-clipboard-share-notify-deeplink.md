# 2610301536 - builtin-clipboard-share-notify-deeplink

- Created: 2026-10-30 15:36 / Archived: 2026-10-31 01:30
- Issue: N/A（不建 issue）
- Milestone: N/A / Base Branch: main

## Summary
在客戶端契約加入殼新增的十個 handler 與兩個事件（剪貼簿文字與圖片、系統分享含檔案、本機通知、深層連結），讓網頁以型別安全的 `callFlutter`／`onFlutterEvent` 使用。
只動契約層（名稱 enum、請求／回應／酬載介面、型別對照表），不新增執行期程式碼；契約正本在 `aqutter` 的同名計畫。

## Cross-Repo Scope
- 共用計畫 ID：`2610301536-builtin-clipboard-share-notify-deeplink`；直接 main，無分支，各 repo 皆無 issue。
- 參與 repo：`aqutter`（殼端實作與契約正本）、`aqutter-js`（契約型別與名稱，即本 repo）、`aqutter-cli`（範本設定，無變更）。
- 執行順序：契約凍結後三者平行；本 repo 完成並移動 tag `0.0.0` 後，`aqutter` 才更新 manifest 的 `client.spec`。
- 名稱必須與 `aqutter` 的 `shell/lib/src/bridge/bridge_names.dart` 逐字相同。

## Contract
- 正本 repo：`aqutter`；最終修訂號：rev 2（凍結，2026-10-30 核准；rev 1 同日凍結）。契約全文不收錄於此。
- Handler：`clipboard_read`、`clipboard_write`、`clipboard_read_image`、`clipboard_write_image`、`share_open`、`notify_show`、`notify_schedule`、`notify_cancel`、`notify_initial`、`deeplink_initial`。
- 事件：`notify_tapped`、`deep_link`。

## Key Decisions
- **範圍**：剪貼簿、分享、本機通知、深層連結；推播、生物辨識、安全儲存不做 — 先做不需要外部服務的常用能力（使用者決議）。
- **位置**：內建在殼的 bridge，不做成 plugin — 使用者決議；代價是每個 App 都帶這些依賴，殼變大。
- **分享範圍**：rev 1 只分享文字與網址，不含檔案 — 檔案牽涉暫存與檔案權限，另案（rev 2 追加，見 Deviations）。
- **排程**：非精確排程、以絕對時間點 — 避免精確鬧鐘權限與時區相依；需要準時另案。
- **權限**：通知 handler 不自動跳授權 — 權限一律經殼既有的權限 handler，行為一致。
- **啟動連結**：啟動 App 的連結只由 `deeplink_initial` 取得，不走事件 — 事件在網頁未連線時會被丟棄，冷啟必須有可重複讀取的來源。
- **流程**：直接 main、不建 issue；契約 rev 1 凍結（2026-10-30 核准）。
- **完成後**：預設只 commit，push 與移動 tag 依使用者之後的明確要求。
- **契約 rev 2**：凍結（2026-10-30 核准）— 分享檔案、圖片剪貼簿、錯誤碼 `too_large`。
- **套件**：圖片剪貼簿由框架自己實作、不引入外部套件（使用者決議）；殼套件宣告為 Flutter plugin，含 Android、iOS、macOS、Windows 的原生程式，Linux 不做。iOS、macOS 沒有裝置可編譯驗證（使用者已知並同意範圍）。

## Deviations
- 契約 rev 2（2026-10-30，執行中追加並經使用者核准）：`share_open` 新增選填 `files`；新增 `clipboard_read_image`、`clipboard_write_image`；新增錯誤碼 `too_large`。原因：使用者要求分享與剪貼簿支援圖片。handler 由八個增為十個。
- 原計畫的一致性測試未新增：`test/bridgeCapabilities.test.ts` 沒有涵蓋新名稱，改以型別檢查（對照表型別）把關。
- `README.md` 本就不列 handler 清單，未修改。

## Impact Files
- `src/contract/bridge.ts:77-101`（`BridgeHandler`）— 新增十個 handler 名稱
- `src/contract/bridge.ts:226-229`（`BridgeEvent`）— 新增 `NotifyTapped`、`DeepLink`
- `src/contract/bridge.ts:355-456` — 新增請求、回應、事件酬載介面（含 `ShareFile`）
- `src/contract/table.ts:150-162`、`:228-229` — handler 與事件的型別對應

## Wiki Changes

## Wiki Changes

| 頁面 | 日期 | 版本 | 變動 | Issue | PR |
|---|---|---|---|---|---|
| `platform/builtin-capabilities.md` | 2026-10-31 | — | 在客戶端契約加入殼新增的十個 handler 與兩個事件（剪貼簿文字與圖片、系統分享含檔案、本機通知、深層連結） | — | — |
