# Tasks for 2610310119

## Phase 1 — 型別與契約（依賴 Contract §1；與 aqutter 的 Phase 2–3 可平行）
- [x] [aqutter-js] 新增 `src/contract/builtinPlugins.ts`：四個內建 plugin 的 `PluginDefinition` 與 module augmentation　依賴 Contract §1　可平行
- [x] [aqutter-js] `src/index.ts` 匯入新檔並更新說明註解
- [x] [aqutter-js] 刪除 `bridge.ts` 的 10 個 `BridgeHandler` 與 2 個 `BridgeEvent` 項目，`table.ts` 對應條目與無用 import；修正 `bridge.ts` 內引用舊名稱的註解連結
- [x] [aqutter-js] 補 `test/bridgeCapabilities.test.ts` 與 `test-types/plugin-types.ts`

## Phase 2 — 驗證
- [x] [aqutter-js] 型別檢查與既有測試全過（依 `package.json` 的 scripts）
- [x] [aqutter-js] 確認舊名稱在 `src/`、`test/`、README 內已無殘留（grep）
- [ ] [aqutter-js] 同步 wiki 與 project.md（Phase 5，wikification）；commit 後把 commit sha 交給 `aqutter` 更新 manifest
