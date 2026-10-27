# Tasks for 2610281120

## Phase 1 — 契約與測試向量（需等待：使用者核准並凍結契約）
- [ ] 取得 `aqutter_core` 的訊框測試向量並放 `test/`　需等待 aqutter_core：測試向量

## Phase 2 — 網頁端傳輸（依賴 Contract §2、§3）
- [ ] `src/frame.ts`：編解碼與測試（含測試向量）
- [ ] `src/transport.ts`：取得連線資訊、連線、排隊、重連、`onTransportState`／`getTransportState` 與測試（假的 `WebSocket`）
- [ ] `src/index.ts`：`callFlutter`／`callPlugin`／事件改走新傳輸；移除 `__flutterBridgeEmit`；`AqutterPluginError` 對應 `err`
- [ ] 移除 `src/channel.ts`、`test/channel.test.ts`、`openBinaryChannel` 匯出

## Phase 3 — 驗證與文件（需等待 aqutter_core 與 aqutter：Dart 端完成）
- [ ] 與殼端對接，Android 實機端對端（呼叫、事件、二進位、重連）
- [ ] `README.md`、`.kn-project/project.md`
- [ ] `pnpm typecheck`、`pnpm test`
