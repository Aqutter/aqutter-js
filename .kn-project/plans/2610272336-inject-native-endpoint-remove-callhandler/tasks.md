# Tasks for 2610272336

## Phase 1 — 治理結構
- [x] [aqutter-js] 以 `kn-project-wikification` 補齊 `.kn-project/wiki/`（使用者於 Phase 0 選擇）

## Phase 2 — client 實作（契約 #2 的消費方）
- [x] [aqutter-js] `src/index.ts`：新增內部 `getEndpoint()`（每次重新讀 `window.aqutterEndpoint`）；`isFlutter()` 改判斷全域；移除 `AqutterBridge.callHandler` 與 `callFlutter` 的 `NativeEndpoint` 特例　依賴 Contract §2 #2　可平行
- [x] [aqutter-js] `src/contract/bridge.ts`、`src/contract/table.ts`：移除 `NativeEndpoint`（與 [aqutter] 的 `bridge_names.dart:16` 成對）
- [x] [aqutter-js] `src/nativeview/element.ts:146`、`native.ts:6`：改共用 `getEndpoint()`

- [x] [aqutter-js] 補列：`src/endpoint.ts` (new)、`src/transport.ts`、`src/nativeview/native.ts`（`resolveEndpoint` 選填）　依賴 Contract §1 #4

## Phase 3 — 測試
- [x] [aqutter-js] 改寫 `test/pluginError.test.ts`（40、68、94 行）
- [x] [aqutter-js] `test/endpoint.test.ts` (new)
- [x] [aqutter-js] `pnpm test` 與型別檢查（`pnpm exec tsc --noEmit`）全過；`git grep -n "callHandler\|native_endpoint\|NativeEndpoint" -- src` 無命中

## Phase 4 — 整合驗證
- [ ] [aqutter-js] 與殼整合：`aqutter-nuxt-app`／`demo-app` 在 iPad、Android、macOS 上傳輸連得上　需等待 [aqutter]：殼端注入完成並通過其驗證
