# 2611182000-seethrough-multi-element

- Created: 2026-11-17 / Archived: 2026-11-17
- Issue: Aqutter/aqutter-js#18
- Milestone: N/A / Base Branch: main

## Summary
修正 aqutter-js #17 在「同一頁多個穿透元素」時的兩個 bug：(1) 同一個標記層的洞互相覆寫，改為模組層級登記表，每個元素各登記自己的洞，遮罩為整層減去所有洞的聯集（`mask-composite: subtract, add, …`，`-webkit-` 對應 `source-out, source-over, …`）；(2) 共用祖先的背景還原互相踩，改為引用計數，最後一個釋放才還原。
公開 API 與 DOM 屬性不變；新增 5 個單元測試並更新既有的 `exclude` 斷言；wiki `native-element.md` 補「多元素」與「祖先背景被清除的副作用」。

## Cross-Repo Scope
- **本計畫所屬 repo**: `aqutter-js`
- **共用計畫 ID**: `2611182000-seethrough-multi-element`　**共用分支名**: `feature/2611182000-seethrough-multi-element`
- **參與 repo 與職責**:
  - `aqutter-js` — 修正與測試、文件　issue: `Aqutter/aqutter-js#18`
- **後續（各自另案）**: `aqutter` manifest 與 `aqutter-cli` 快照重同步；`aqutter-nuxt-app` 前進鎖定。plugins 不用動。

## Key Decisions
- **[Phase 0]** 單一 repo；Milestone 不指定；Base Branch = `main`；前例走 issue＋PR。
- **[Q1]** 單元測試＋Android 實機。
- **[完成後]** commit + 推送 + 開 PR（base main）— 使用者核准。
- **[範圍]** 只改 aqutter-js 的 seeThrough；不改 core、殼、plugins。

## Deviations
- Android 實機（ASUS）驗證：nuxt-app plugins 頁（mirror-demo 與 google-maps 同頁），暫時以 pnpm override 指向本機 aqutter-js（已還原）。兩個元素同時在穿透模式正確顯示（mirror-demo 的格線與圓球、google-maps 的地圖），捲動時兩個洞都跟著移動。修正前 mirror-demo 的區域被背景蓋住。
- 多洞遮罩的 `mask-composite` 合成順序（整層 `subtract`、洞 `add`）在 Android WebView（Chromium）實機確認；其他瀏覽器引擎未驗證。
- 未驗證：iOS 與桌面。

## Impact Files
- `src/nativeview/seeThrough.ts:64-90` (`clearAncestorBackgrounds`) — 祖先改用共用登記表與引用計數。
- `src/nativeview/seeThrough.ts:137-155` (`holeMask`) 與 `:156-241` (`startSeeThrough`) — 標記層改用共用登記表，多洞遮罩與 `subtract`／`add` 合成。
- `test/nativeSeeThrough.test.ts` — 既有的 `exclude` 斷言改為 `subtract`，新增：兩個元素各自的洞同時存在、一個停止只移除自己的洞、洞重疊、祖先引用計數（先停止的不還原、最後一個才還原、反向順序）、不同順序的 start／stop。
- `.kn-project/wiki/platform/native-element.md` — 補「同一頁多個穿透元素」與祖先背景被清除的副作用。

## Wiki Changes

| 頁面 | 日期 | 版本 | 變動 | Issue | PR |
|---|---|---|---|---|---|
| `platform/native-element.md` | 2026-11-18 | — | 多個穿透元素共用標記層與祖先背景 | [#18](https://github.com/Aqutter/aqutter-js/issues/18) | — |
