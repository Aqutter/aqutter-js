# 2611171503-native-passthrough-mode

- Created: 2026-11-17 / Archived: 2026-11-17
- Issue: Aqutter/aqutter-js#14
- Milestone: N/A / Base Branch: main

## Summary
`<aqutter-native>` 新增 `mode` 屬性與穿透模式的網頁端：每次連線先協商模式、回報元素矩形、偵測頁面可不可以穿透，穿透時不建立 canvas，鏡像與穿透共用同一組手勢與事件。
改動集中在 `src/nativeview/`：新增 `layout.ts`（矩形追蹤與 `pageReady` 偵測）、`native.ts` 的 `mode`／`layout` 訊息與 1 秒逾時退回鏡像、`element.ts` 的 `mode` 屬性與 `aqutter-mode` 事件。

## Cross-Repo Scope
- **本計畫所屬 repo**: `aqutter-js`
- **共用計畫 ID**: `2611171503-native-passthrough-mode`　**共用分支名**: `feature/2611171503-native-passthrough-mode`
- **參與 repo 與職責**（一 repo 一 issue，尚未建立時寫 `待建立`）:
  - `aqutter_core` — 契約正本；協定的原生端、`AqutterNative` widget、`passthroughSessions`、Android WebView 透明的行為保證　issue: `Aqutter/aqutter_core#31`
  - `aqutter-js` — 標籤的 `mode` 屬性、模式協商、頁面可穿透偵測、`layout` 追蹤、`aqutter-mode` 事件　issue: `Aqutter/aqutter-js#14`
  - `aqutter` — 殼：監聽 `passthroughSessions` 切換 WebView 透明　issue: `Aqutter/aqutter#68`
  - `aqutter-plugins` — google-maps 等 plugin 沿用同一個標籤與 `AqutterNative`，加上 `mode` 選項、文件　issue: `Aqutter/aqutter-plugins#8`
- **執行順序相依**: `aqutter_core`（協定與 Dart 端）先；`aqutter-js` 在契約凍結後可與 core **平行**（兩端以契約為準，整合驗證需等兩邊都完成）；`aqutter`（殼）與 `aqutter-plugins` 需等待 `aqutter_core` 的 `passthroughSessions` 與透明行為保證完成，plugin 另需等待 `aqutter-js`。
- **跨 repo 檔案指涉**: 無（各 repo 的檔案只列在自己的 `## Impact Files`）。
- **合併後的連動**: 各 repo 合併後，`aqutter` 的 `manifest/releases.json`（`core.ref`、`shell.ref`、`client.spec`）與 `aqutter-cli` 的 manifest 快照需重新同步，0.0.0 tag 需移動，見各份 `## Manual Follow-ups`。
- **契約**：正本 `aqutter_core`，最終 rev 2；介面共 9 項（`mode` 屬性、`mode` 請求與回覆、`layout`、手勢訊息不變、`AqutterNative(mode:)`、`passthroughSessions`、`aqutter-mode` 事件、WebView 透明的行為保證）；全文在 aqutter_core 的 archive 與 PR 說明。

## Key Decisions
- **[Phase 0]** 目標 repo：`aqutter_core`、`aqutter-js`、`aqutter`、`aqutter-plugins`（依據：鏡像實作在 `aqutter_core/lib/src/nativeview/` 與 `aqutter-js/src/nativeview/`；殼的底層與 WebView 在 `aqutter/shell/lib/src/app.dart`；使用端在 `aqutter-plugins/packages/google-maps`）。`aqutter-cli`、`aqutter-nuxt-app` 不在本次範圍（只有合併後的鎖定同步）。
- **[Milestone]** 四個 repo 皆不指定，以 `main` 為 base — 使用者於 Phase 0 選擇。
- **[Q1]** 預設 `mode` 為 `auto` — 使用者決議；已知會改變既有 Android App 的行為，以 `pageReady` 偵測降低風險（契約 §5）。
- **[Q2]** iOS 的 `auto` 先視為不支援 — 理由：沒有 iOS 設備，未驗證。
- **[設計]** 模式決策只在原生端；網頁只回報 `pageReady`。 — 理由：兩端各自決策會不一致。
- **[設計]** 手勢座標維持相對元素 0..1。 — 理由：plugin 的手勢處理不需修改；穿透時原生端以元素大小的 child 承接。
- **[設計]** 底層原生內容與元素同大、同位置（不是螢幕大小）。 — 理由：前置實驗證實螢幕大小的地圖在元素一開始在螢幕外時，捲進來會是空白。
- **[設計]** 殼的 WebView 透明依 `passthroughSessions` 動態切換，不是全域常開。 — 理由：避免啟動時與其他畫面露出底層。
- **[前置實驗]** 透明的初始設定在 Android 不生效（兩段式才生效），列為 aqutter_core 要查根因的工作，不在殼繞過。
- **[程式碼風格]** 實作遵守 `kn-project-code-style`。
- **[契約]** rev 1 凍結（核准日 2026-11-17）。
- **[契約變更]** rev 1 → rev 2（已核准）：child 一律保持掛載，穿透時第一則可見 layout 前以 `Offstage` 隱藏（契約 §4、§6）；只影響 aqutter_core 的實作，本 repo 只同步契約文字。
- **[實作]** 手勢事件改綁在宿主元素（`this`）而不是 canvas：鏡像時 canvas 填滿宿主、行為不變；穿透時沒有 canvas，宿主就是互動區。穿透時把 canvas 從 shadow DOM 拿掉（鏡像時放回），`AqutterNative` 保留 canvas 參考。
- **[實作]** `AqutterNative`（類別）只有提供 `mode` 選項才協商，省略時維持舊行為；元素一律提供。逾時退回鏡像的原因 `no-reply` 只存在網頁端（契約 §3 的「無回覆」列）。
- **[驗證]** Android 實機（ASUS，API 33）以 core 的修正＋本計畫的網頁端＋**未修改**的 google-maps plugin：預設 `auto` 協商成穿透、`mode="mirror"` 換成 canvas 鏡像、再改回 `passthrough` 換回，三種狀態的 `effectiveMode`、canvas 有無與畫面都符合。
- **[未做]** `docs/nativeview.md`（本 repo）沒有補穿透模式章節：不在 `## Impact Files`，補的話需先補列並重新核准；目前由元素的 JSDoc 與 core 的 `doc/nativeview.md` 說明。
- **[完成後]** commit + 開 PR（Rule 12 非互動鏈；完成前自動 fetch 後 rebase origin/main 並 push --force-with-lease --force-if-includes）。
- **[執行模式]** 序列（依據：環境只有單一 agent，沒有獨立子 agent）；順序 aqutter_core → aqutter-js → aqutter → aqutter-plugins。
- **[範圍]** 使用者指示「先定契約」：本次先把契約凍結、建立 issue 與分支並提交計畫，實作（`tasks.md` 的 Phase 1 起）等使用者確認後再開始。

## Deviations
- **契約 rev 1 → rev 2**：只同步契約文字，本 repo 的程式不受影響（變更內容見 aqutter_core 的 archive）。
- **手勢事件改綁在宿主元素而不是 canvas**（計畫未明寫）：鏡像時 canvas 填滿宿主，行為不變；穿透時沒有 canvas，宿主就是互動區。
- **本 repo 的 `docs/nativeview.md` 沒補穿透章節**：不在計畫的 Impact Files，由元素的 JSDoc 與 core、殼的文件說明。
- **Wiki**：本 repo 的 wiki 沒有任何頁說明 `<aqutter-native>`，新增一頁 `platform/native-element.md`。
- 實機驗證只在 Android；`no-reply` 逾時退回在單元測試以假連線驗證，沒有用真的舊版原生端跑過。

## Impact Files
- `src/nativeview/element.ts:55` (`observedAttributes`)、`:66` (`connectedCallback`)、`:134` (`restart`)、`:22` (`TEMPLATE`) — 新增 `mode` 屬性與協商流程；穿透時不建立／隱藏 canvas；派發 `aqutter-mode`；`mode` 屬性改變時 `restart()`。
- `src/nativeview/native.ts:17-21` (`ControlMessage`)、`:81` (`AqutterNative`)、`:191` (`sendRaw`) — 新增 `mode`、`layout` 訊息型別與送出；接收 `mode` 回覆；1000 ms 逾時退回鏡像；穿透時不處理幀。
- `src/nativeview/index.ts` — 匯出新增型別（模式、`AqutterNativeModeEvent`）。
- `src/nativeview/layout.ts` (new) — 元素矩形追蹤（ResizeObserver、捕獲 scroll、resize、每畫面一次）與 `pageReady` 偵測，獨立成純函式／小類別方便測試。
- `test/nativeview.test.ts`、`test/native.test.ts` — 補 `mode` 屬性、協商、逾時退回、`layout` 節流、`pageReady` 偵測的測試。

## Wiki Changes

| 頁面 | 日期 | 版本 | 變動 | Issue | PR |
|---|---|---|---|---|---|
| `platform/native-element.md` | 2026-11-17 | — | 建立 | [#14](https://github.com/Aqutter/aqutter-js/issues/14) | — |
