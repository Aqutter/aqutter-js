# 2610271120 - unified-bridge-transport

- Created: 2026-10-27 11:20 / Archived: 2026-10-27 16:00
- Issue: Aqutter/aqutter-js#6
- Milestone: N/A / Base Branch: main

## Summary
網頁端新增傳輸層：`callFlutter`／`callPlugin`／`onFlutterEvent`／`onPluginEvent` 的簽章不變，內部改走一條多工 WebSocket（`/channel/aqutter.rpc`），酬載可直接帶 `ArrayBuffer`／`Uint8Array`；連線建立前的呼叫排隊 10 秒、意外中斷自動重連（200 ms 起指數退避，上限 5 秒）、已送出的呼叫以 `TRANSPORT_CLOSED` 失敗、超過 64 MiB 自動分段，並新增 `onTransportState`／`getTransportState`。`openBinaryChannel` 與 `__flutterBridgeEmit` 移除。

## Cross-Repo Scope
- 共用計畫 ID `2610271120-unified-bridge-transport`、共用分支名 `feature/2610281120-unified-bridge-transport`。
- `Aqutter/aqutter_core`（`#6`）：`AqutterRpcHost`——訊框編解碼、`aqutter.rpc` 通道、handler 登錄與分派、`emit`、自動分段。
- `Aqutter/aqutter`（`#20`，界接）：內建與 plugin handler 登錄到 `AqutterRpcHost`、`supportedPlatforms`、`aqutterError` 轉換、移除 `channels`；文件與基準。
- `Aqutter/aqutter-js`（`#6`）：傳輸模組（連線、排隊、重連）、訊框編解碼、`callFlutter`／`callPlugin`／事件改走新傳輸、`onTransportState`、移除 `openBinaryChannel`。
- 順序：`aqutter_core` → `aqutter` → `aqutter-js`（契約 rev 2 起，core 與 js 可平行）。

## Key Decisions
- **[Phase 0]** 整合主幹 `main`；三個 repo 皆不指定 milestone，base 為 `main`。
- **[方向]** 使用者要求擴充 plugin 與使用 Flutter⇄網頁通道時不要有太多選擇，因此合併成單一傳輸，不並存兩套 API；開發介面（`handlers`、`emit`、`callPlugin`、`onPluginEvent`）不變，二進位直接放進酬載。
- **[分層]** Dart 端程式碼與介面由 `aqutter_core` 提供，`aqutter` 只做界接。
- **[Q1]** 內建 handler 全部改走新傳輸，只留 `native_endpoint` 在 `callHandler`。
- **[Q2]** Linux 由 agent 以 WSL2 驗證；iOS、macOS 由使用者用 Mac 驗證（追蹤於 Aqutter/aqutter#21）；失敗的處理屆時再決定，不預設也不排除全面統一。
- **[Q3]** 重連期間的事件不補發，提供 `onTransportState`。
- **[Q4]** 呼叫不設預設逾時；連線關閉時已送出的呼叫以 `TRANSPORT_CLOSED` 失敗。
- **[Q5]** 單一 WebSocket 訊息上限 64 MiB（rev 1）。
- **[契約變更]** rev 1 → 2：新增 `part` 訊框與自動分段，邏輯訊框上限 512 MiB（使用者要求框架自動處理大資料，2026-10-27 核准）。
- **[執行模式]** 序列。
- **[執行中]** 新連線到來時舊連線以 1000 關閉（最後一條有效）；訊框超過上限以 1009、格式錯誤以 1002 關閉——補上契約未指定的細節。
- **[完成後]** commit + 開 PR（併回 `main`）。

## Deviations
- 計畫 ID 與日期更正：原 `2610281120`（誤用 2026-10-28，機器日期是 2026-10-27）更正為 `2610271120`；GitHub 上實際存在過的分支名（`feature/2610281120-unified-bridge-transport`）、PR 與 issue 留言維持原樣。
- 契約 rev 1 → rev 2：新增 `part` 與自動分段（`encodeMessages`、`Reassembler`）、上限 512 MiB。
- 單元測試用假的 `WebSocket`；真實路徑在 Android、Windows、Linux（WSL2）實機以真實殼驗證。
- iOS、macOS 未驗證（Aqutter/aqutter#21）。

## Impact Files
- `src/frame.ts` (new) — 訊框編解碼、分段與重組（與 `aqutter_core` 的 `rpc_frame.dart` 成對）。
- `src/transport.ts` (new) — `Transport`：取得連線資訊、連線、排隊、重連、事件與狀態。
- `src/error.ts` (new) — `AqutterPluginError`（由 `src/index.ts` 搬出並重新匯出）。
- `src/index.ts` — `callFlutter`、`callPluginRaw`、`onFlutterEvent`、`onPluginEventRaw` 改走傳輸；`native_endpoint` 維持 `callHandler`；新增 `getTransportState`、`onTransportState`；移除 `__flutterBridgeEmit`。
- `src/channel.ts`、`test/channel.test.ts` — 移除。
- `src/contract/bridge.ts` — 註解更新。
- `test/frame.test.ts` (new)、`test/transport.test.ts` (new)、`test/pluginError.test.ts`、`test/rpc_frame_vectors.json` (new，與 core 逐字相同) — 共 105 個測試。
- `README.md`、`.kn-project/project.md` — 說明與保留鐵則。

## Details
- 驗證：`tsc --noEmit` 乾淨、`vitest` 105 個全過。
