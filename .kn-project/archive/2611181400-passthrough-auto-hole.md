# 2611181400-passthrough-auto-hole

- Created: 2026-11-17 / Archived: 2026-11-17
- Issue: Aqutter/aqutter-js#16
- Milestone: N/A / Base Branch: main

## Summary
穿透時 `<aqutter-native>` 自動讓出頁面背景：元素往上到 `<html>` 的不透明背景暫時改成透明；標了 `data-aqutter-bg` 的底層背景層用 CSS `mask` 在元素位置挖洞，洞的圓角取自元素的 `border-radius`，隨矩形（含捲動）更新；退回鏡像、斷線、元素移除時全部還原。`keep-background` 屬性可關閉，`auto` 的 `pageReady` 預設不再因祖先背景退回鏡像。
新增 `src/nativeview/seeThrough.ts` 與 12 個單元測試，`element.ts` 接上啟停，更新 wiki `native-element.md`。

## Cross-Repo Scope
- **本計畫所屬 repo**: `aqutter-js`
- **共用計畫 ID**: `2611181400-passthrough-auto-hole`　**共用分支名**: `feature/2611181400-passthrough-auto-hole`
- **參與 repo 與職責**:
  - `aqutter-js` — 實作、測試、文件（本計畫）　issue: `Aqutter/aqutter-js#16`
- **後續（各自另案，不在本計畫）**：`aqutter-plugins`（google-maps 建立的 `<aqutter-native>` 讓 `border-radius` 繼承容器，README 更新）；`aqutter` manifest 與 `aqutter-cli` 快照重同步；`aqutter-nuxt-app` 改用 `data-aqutter-bg` 並移除 `seeThrough` 的手動處理，展示頁換漸層背景。
- **執行順序相依**: 本計畫先；後續全依賴它合併。

## Key Decisions
- **[Phase 0]** 單一 repo；Milestone 不指定；Base Branch = `main`。`project.md` 寫開發階段直接推 `main`，但前兩份穿透計畫都走 issue＋PR，沿用後者（待核准閘確認）。
- **[Q1]** 預設開，`keep-background` 關閉。
- **[Q2]** 取元素本身的 `border-radius`。
- **[Q3]** 單元測試＋Android 實機。
- **[完成後]** commit + 推送 + 開 PR（base main）— 使用者核准。
- **[範圍]** 只改 aqutter-js；core、殼、plugins、nuxt-app 另案。

## Deviations
- Android 實機（ASUS）驗證：nuxt-app `/map-effects`，以暫時的 `pnpm` override 指向本機 aqutter-js、`pubspec_overrides.yaml` 指向本機 core（皆已還原）。`passthrough` 漸層背景＋圓角洞正常、捲動時洞跟著移動；`mirror` 正常；頁面沒有任何手寫的挖洞或位置追蹤程式。
- 「圓角取自元素本身的 `border-radius`」：`<aqutter-native>` 預設沒有圓角，實機驗證時是在頁面用 CSS 讓它繼承容器的圓角。google-maps plugin 內建這個繼承是後續計畫（aqutter-plugins）。
- 未驗證：iOS 與桌面；標記層在 shadow DOM 內的情況（只查 document）。
- aqutter 的 `docs/nativeview.md` 仍寫著「祖先不可有不透明背景」，屬跨 repo 文件，待 aqutter 的後續計畫修剪。

## Impact Files
- `src/nativeview/seeThrough.ts` (new) — 祖先透明與標記層挖洞控制器。
- `src/nativeview/element.ts:158-170` (`onModeResolved`)、`:67` (`observedAttributes`)、`:91` (`disconnectedCallback`) — 啟停控制器、新增 `keep-background` 屬性。
- `src/nativeview/layout.ts:69` (`trackLayout`)、`:166` (`detectPageReady`) — 矩形更新回呼給控制器共用；`detectPageReady` 在功能開啟時不把祖先背景算作不通過。
- `src/nativeview/index.ts` — 匯出新模組（型別）。
- `test/nativeSeeThrough.test.ts` (new) — 祖先設定與還原、標記層 mask 隨矩形更新、圓角取自 `border-radius`、`keep-background` 關閉、離開穿透時還原、shadow root。
- `test/nativeLayout.test.ts` — `detectPageReady` 的新行為。
- `.kn-project/wiki/platform/native-element.md` — 頁面條件與兩個新屬性（需同步修剪頁面條件一節的舊說法）。
- `README.md` — 若有穿透章節則修剪。

## Wiki Changes

| 頁面 | 日期 | 版本 | 變動 | Issue | PR |
|---|---|---|---|---|---|
| `platform/native-element.md` | 2026-11-18 | — | 穿透時自動讓出頁面背景（祖先透明、標記層挖洞），新增 keep-background | [#16](https://github.com/Aqutter/aqutter-js/issues/16) | — |
