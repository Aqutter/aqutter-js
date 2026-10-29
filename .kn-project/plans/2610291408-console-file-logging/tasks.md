# Tasks for 2610291408

## Phase 1 — 契約與實作
- [x] [aqutter-js] `LogProvider`／`LogTarget`／`LogAppendRequest.target`（Contract §1–2）
- [x] [aqutter-js] `src/console.ts`：`installConsoleLog`、`console.to`、序列化、串行寫入　依賴 Contract §2
- [x] [aqutter-js] `src/index.ts` 匯出

## Phase 2 — 驗證
- [x] [aqutter-js] `test/console.test.ts`、`pnpm typecheck`、`pnpm test`
- [x] [aqutter-js] README/AGENTS 無需更新（TSDoc 已涵蓋）

## Phase 3 — rev 2：動態 target（待核准）
- [x] [aqutter-js] `TargetSource`＋每筆求值＋`log_target_error`（Contract §2 rev 2）
- [x] [aqutter-js] `setConsoleLogTarget`
- [x] [aqutter-js] 測試（137 通過）、typecheck；push 後移動 tag 0.0.0 並更新 aqutter manifest 的 client.spec 尚待使用者要求
