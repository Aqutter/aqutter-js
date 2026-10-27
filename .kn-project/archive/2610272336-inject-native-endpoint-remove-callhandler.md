# 2610272336 - inject-native-endpoint-remove-callhandler

- Created: 2026-10-27 23:36 / Archived: 2026-10-28 00:10
- Issue: Aqutter/aqutter-js#12
- Milestone: N/A / Base Branch: main

## Summary
client 改讀殼注入的 `window.aqutterEndpoint` 取得本機傳輸的連線資訊並判斷是否在殼內，移除 `callHandler`、`BridgeHandler.NativeEndpoint` 與 `AqutterBridge`；`AqutterNative` 的 `resolveEndpoint` 改為選填，預設讀同一個全域。
新增 `src/endpoint.ts`（每次連線前重新讀取，不快取，所以殼重啟換新端點後重連就拿到新值）、`test/endpoint.test.ts`，並補齊 `.kn-project/wiki`（統一傳輸、連線資訊兩頁）。測試 111 項全過。

## Cross-Repo Scope
- 參與 repo 與職責：`aqutter_core`（提供 `AqutterNativeHost.endpoint`，issue Aqutter/aqutter_core#10）、`aqutter`（殼：移除 `native_endpoint`、注入 `window.aqutterEndpoint`，契約正本，issue Aqutter/aqutter#33）、`aqutter-js`（client：改讀全域、移除 `callHandler`，issue Aqutter/aqutter-js#12）。
- 共用計畫 ID `2610272336-inject-native-endpoint-remove-callhandler`，共用分支名 `feature/2610272336-inject-native-endpoint-remove-callhandler`，三份計畫都 `base = main`。
- 執行順序：`aqutter_core` → `aqutter` → `aqutter-js`（序列執行）；建議合併次序同。契約介面 #1–#4（`AqutterNativeHost.endpoint`、`window.aqutterEndpoint`、移除 `native_endpoint`／`callHandler`、`resolveEndpoint` 選填），最終 rev 3，提供方與正本 repo 為 `aqutter`。

## Key Decisions
- **[範圍]** 使用者要求「完全移除舊通道寫法，未來只會有新通道」；引導方式選「改由殼注入」（來源：對話，Phase 0）。
- **[repo]** 目標 repo 清單 = `aqutter`、`aqutter-js`、`aqutter_core`（來源：使用者確認，Phase 0 步驟 0）。
- **[Milestone]** 不指定，`Base Branch` = `main`（來源：使用者於 Phase 0 選擇；AGENTS.md 寫明開發階段版本一律 `0.0.0`）。
- **[整合主幹]** 遠端無 `dev`／`develop`／`development` 分支，採 `origin/HEAD` = `main`，依規定不詢問、不記錄。
- **[設計]** 不新增「端點已變更」的網頁事件：重啟後的恢復靠 `Transport` 既有重連（800 ms）重新讀取全域，避免多一個介面。
- **[設計]** `isFlutter()` 改以 `window.aqutterEndpoint` 是否存在判斷，不再看 `window.aqutter`（否則仍依賴舊橋接物件）。
- **[治理]** `aqutter-js` 補齊 `.kn-project/wiki/`（來源：使用者於 Phase 0 選擇「補齊 wiki」；核准後以 `kn-project-wikification` 建立）。
- **[Q1]** 全域名稱採 `window.aqutterEndpoint` — 理由：不受核心橋接腳本 `window.aqutter = {}`（`aqutter_core` 的 `android/src/main/kotlin/com/github/aqutter/core/plugin_scripts_js/JavaScriptBridgeJS.kt:301`）覆蓋影響，注入順序不重要。
- **[Q2]** `demo-app/dbltest.html` 直接刪除（使用者選擇）— 理由：該頁只為雙擊測試，且依賴舊的 `callHandler`；`demo-app` 非 git repo，刪除前備份到暫存區，由 `aqutter` 那份計畫的執行者處理。
- **[契約]** rev 1 凍結（使用者於 Phase 2 核准閘核准）。
- **[完成後]** commit + 開 PR（預設；自動歸檔＋wiki，Rule 12 非互動鏈）；完成前將 `git fetch` 後 `git rebase origin/main` 並 `git push --force-with-lease --force-if-includes`，重寫的是遠端工作分支（來源：核准閘，僅本計畫生效）。
- **[執行模式]** 序列（依據：契約 #1 先於 #2，`aqutter` 依賴 `aqutter_core`；整合驗證需要三個 repo 都完成；無法確認可派出獨立子 agent）。順序：`aqutter_core` → `aqutter` → `aqutter-js`。
- **[契約變更]** rev 1 → 2（已核准並凍結）：新增 #4 `AqutterNativeOptions.resolveEndpoint` 改選填 — 原因：`docs/nativeview.md:67` 的公開用法依賴 `BridgeHandler.NativeEndpoint`（來源：執行中發現，Rule 29）。
- **[補列]** 計畫執行中發現未列的檔案，已補進 `## Impact Files`，並於 2026-10-27 重新核准（Rule 18/2）。
- **[契約]** rev 2 凍結（使用者於重新核准閘核准）。
- **[補列]** `.kn-project/project.md`（第 11、30 行）補進 `## Impact Files`，使用者於實作中重新核准。
- **[順序]** Phase 1（補齊 wiki）排在 Phase 2–3 之後、commit 之前執行 — 理由：wiki 描述的是完成後的現況；使用者核准（2026-10-27）。
- **[契約變更]** rev 2 → 3（已核准並凍結，2026-10-28）：更正 §3 的重連間隔數字（Phase 4 契約一致性檢查發現，Rule 29）；介面與行為不變。
- **[契約]** rev 3 凍結（使用者於 2026-10-28 核准，只更正 §3 的重連間隔數字）。

## Deviations
- 契約 rev 1 → 2（2026-10-27）：新增介面 #4（`AqutterNativeOptions.resolveEndpoint` 改選填，預設讀全域）。原因：`aqutter` 的 `docs/nativeview.md:67` 公開範例把 `callFlutter(BridgeHandler.NativeEndpoint)` 傳給它，移除 `NativeEndpoint` 後必須有替代。
- 契約 rev 2 → 3（2026-10-28）：更正 §3 的重連間隔（`Transport` 是 200 ms 起、每次加倍、上限 5 秒，不是 800 ms；800 ms 是鏡像元素的預設）。介面與行為不變。
- 內部 `getEndpoint()` 放在新檔 `src/endpoint.ts`，而非計畫寫的 `src/index.ts`（避免與 `nativeview` 互相匯入）；`src/transport.ts`、`src/nativeview/native.ts` 與 `.kn-project/project.md` 為補列檔案，已重新核准。
- Phase 1（補齊 wiki）依使用者核准排在實作之後、commit 之前，讓 wiki 寫的是完成後的現況。
- 未驗證：實體 iPad、Windows、Linux；macOS 的「回前景換新埠」；release 版（只驗證了 Android 手機上 `demo-app` 的 release 版可獨立開啟）。

## Impact Files
- `src/index.ts:15` (檔頭說明「`callHandler` 只用來取得連線資訊」)、`:21-26` (`interface AqutterBridge`)、`:36-47` (`getFlutter`、`isFlutter`)、`:50-60` (`getTransport` 的 `resolveEndpoint`)、`:96-106` (`callFlutter` 對 `NativeEndpoint` 的特例)、`:181`、`:256`、`:296`（`isFlutter()`／`getFlutter()` 使用處）— 改為讀 `window.aqutterEndpoint`，移除 `callHandler`。
- `src/contract/bridge.ts:4`、`:16` (說明)、`:23` (`NativeEndpoint = 'native_endpoint'`)、`:171` (`interface NativeEndpoint`) — 移除 enum 成員與型別，與殼的 `shell/lib/src/bridge/bridge_names.dart:16` 成對。
- `src/contract/table.ts:42`（匯入）、`:105` (`[BridgeHandler.NativeEndpoint]: { req: NoPayload, res: NativeEndpoint }`) — 移除。
- `src/nativeview/element.ts:146` (`resolveEndpoint: () => callFlutter(BridgeHandler.NativeEndpoint)`) — 改為共用 `getEndpoint()`。
- `src/nativeview/native.ts:6` — 型別說明從「bridge handler `native_endpoint`」改為「殼注入的 `window.aqutterEndpoint`」。
- `test/pluginError.test.ts:40` (mock 的 `callHandler`)、`:68` (`expect(handlers).toEqual(['native_endpoint'])`)、`:94-96` (`callFlutter keeps native_endpoint on callHandler…`) — 改寫為：不再呼叫 `callHandler`、`native_endpoint` 不存在、端點取自全域。
- `test/endpoint.test.ts` (new) — `isFlutter()` 隨全域存在與否改變；端點每次連線重新讀取（重啟後用新值）；全域不存在時不連線。
- `.kn-project/wiki/**` (new) — 補齊治理結構（使用者於 Phase 0 選擇；核准後以 `kn-project-wikification` 建立）。
- `src/endpoint.ts` (new) — 內部 `getEndpoint()`（讀 `window.aqutterEndpoint`、每次重讀）與 `Endpoint` 型別；獨立檔案避免 `index.ts` 與 `nativeview` 互相匯入造成循環（取代原計畫把 `getEndpoint()` 放在 `src/index.ts`）。
- `src/transport.ts:1,11,142` — 匯入的 `NativeEndpoint` 型別（來自即將移除的 `contract/bridge.ts:171`）改用 `src/endpoint.ts` 的型別；錯誤字串 `native_endpoint failed` 改為 `endpoint unavailable`（補列）。
- `src/nativeview/native.ts:36-37` (`resolveEndpoint` 選項)、`:224` — 改為選填，省略時用 `getEndpoint()`（契約 rev 2 #4）；`src/nativeview/element.ts:146` 因此不再傳 `resolveEndpoint`。
- `.kn-project/project.md:11`（「傳輸成對」一行的 `callHandler` 說明）、`:30`（「已驗證」的測試數）— 改為殼注入的 `window.aqutterEndpoint`；測試數更新（補列，2026-10-27 核准）。

## Details
不相容升級：舊網頁包搭新殼不能用（新殼不再回應 `native_endpoint`、也不注入給舊 client 判斷是否在殼內的物件），網頁包必須用新 client 重打（`aqutter seed`）。`window.aqutter`（平台層橋接物件）仍由核心注入，但已不屬於框架契約。

## Wiki Changes

| 頁面 | 日期 | 版本 | 變動 | Issue | PR |
|---|---|---|---|---|---|
| `platform/endpoint.md` | 2026-10-28 | — | 建立 | [#12](https://github.com/Aqutter/aqutter-js/issues/12) | [PR #13](https://github.com/Aqutter/aqutter-js/pull/13) |
| `platform/transport.md` | 2026-10-28 | — | 建立 | [#12](https://github.com/Aqutter/aqutter-js/issues/12) | [PR #13](https://github.com/Aqutter/aqutter-js/pull/13) |
