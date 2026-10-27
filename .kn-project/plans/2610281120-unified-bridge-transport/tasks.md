# Tasks for 2610281120

## Phase 1 — 契約與測試向量（需等待：使用者核准並凍結契約）
- [x] 取得 `aqutter_core` 的訊框測試向量並放 `test/`　需等待 aqutter_core：測試向量

## Phase 2 — 網頁端傳輸（依賴 Contract §2、§3）
- [x] `src/frame.ts`：編解碼與測試（含測試向量）
- [x] `src/transport.ts`：取得連線資訊、連線、排隊、重連、`onTransportState`／`getTransportState` 與測試（假的 `WebSocket`）
- [x] `src/index.ts`：`callFlutter`／`callPlugin`／事件改走新傳輸；移除 `__flutterBridgeEmit`；`AqutterPluginError` 對應 `err`
- [x] 移除 `src/channel.ts`、`test/channel.test.ts`、`openBinaryChannel` 匯出

## Phase 2b — 契約 rev 2：自動分段
- [x] `part` 訊框、`encodeMessages`、`Reassembler`、傳輸改用分段、測試向量與測試

## Phase 3 — 驗證與文件（需等待 aqutter_core 與 aqutter：Dart 端完成）
- [ ] 與殼端對接，Android 實機端對端（呼叫、事件、二進位、重連）
- [x] `README.md`、`.kn-project/project.md`
- [x] `pnpm typecheck`、`pnpm test`
