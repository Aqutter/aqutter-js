# 2610271034 - binary-channel-and-channel-benchmarks

- Created: 2026-10-27 10:34 / Archived: 2026-10-28 10:00
- Issue: Aqutter/aqutter-js#3
- Milestone: N/A / Base Branch: main

## Summary
網頁端新增 `openBinaryChannel("<pluginId>.<channel>")`：以 `native_endpoint` 取得埠與令牌，連上殼的 `/channel/<name>`，回傳 `BinaryChannel`（`send`／`bufferedAmount`／`onMessage`／`onClose`／`close`）；名稱不合法、被拒（錯誤訊息含 CSP 提示）、逾時（10 秒）都會 reject。Android 實機 1MB 往返比 base64 快約 11 倍。

## Cross-Repo Scope
- 共用計畫 ID `2610271034-binary-channel-and-channel-benchmarks`、共用分支名 `feature/2610271034-binary-channel-and-channel-benchmarks`。
- `Aqutter/aqutter_core`（`#2`、PR `#3`）：通道的路由、註冊與連線介面。
- `Aqutter/aqutter`（`#14`，契約正本，PR `#15`）：`AqutterPlugin.channels`、註冊、基準工具與文件。
- `Aqutter/aqutter-js`（`#3`、PR `#4`）：`openBinaryChannel`。
- 順序：core → aqutter → aqutter-js。

## Key Decisions
- **[Phase 0]** 整合主幹 `main`；三個 repo 的 milestone 皆不指定，base 為 `main`。
- **[分層]** Dart 端型別與能力（連線、處理函式型別、註冊）都在 `aqutter_core`；殼只做界接。
- **[Q2]** 伺服器放在 `aqutter_core` 的 `AqutterNativeHost`，與鏡像共用伺服器與令牌（未採納「殼內另建」）。
- **[v1 範圍]** 只做二進位，不做背壓與自動重連；斷線後由網頁端自行重新開啟。
- **[契約]** rev 1 凍結（2026-10-27），實作後路徑、名稱格式與 API 未變。
- **[可測試性]** 核心是 `connectBinaryChannel(name, resolveEndpoint, options)`，`openBinaryChannel` 只是接上 `callFlutter(native_endpoint)`。

## Deviations
- 未歸檔就合併：PR #4 合併時尚未歸檔，歸檔另開 PR 補上；本 repo 沒有 wiki。
- 單元測試只用假的 `WebSocket`；真實路徑事後在 Android 實機驗證（`openBinaryChannel` 對真實通道）。

## Impact Files
- `src/channel.ts` (new) — `openBinaryChannel`、`connectBinaryChannel`、`BinaryChannel`、`binaryChannelNamePattern`。
- `src/index.ts` — 匯出 channel。
- `test/channel.test.ts` (new) — 7 個測試（名稱、URL 與令牌編碼、收訊、關閉資訊、被拒、逾時、無法取得連線資訊）。
- `README.md` — 二進位通道一行說明與 CSP 提醒。
