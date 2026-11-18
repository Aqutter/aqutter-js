# 2611172358-ios-passthrough-drag-jitter

- Created: 2026-11-18 23:58 / Archived: 2026-11-19 00:16
- Issue: Aqutter/aqutter-js#20
- Milestone: N/A / Base Branch: main

## Summary
穿透元素的 `layout` 訊息新增 `webRegions`：iOS 上以 `document.elementFromPoint` 取樣元素內網頁要接管觸控的區域，讓 core 把其餘區域的觸控直接交給原生。
取樣以 8 CSS px 為格、合併成矩形（上限 64 個，超過改用較粗外框，網頁區域只會變大），最短間隔 100ms，隨 DOM、捲動、大小與可見性變動重取；非 iOS 或無 `elementFromPoint` 時不帶欄位。`aqutter_core` 為契約正本；端到端在 iPad 實機與模擬器驗證。

## Cross-Repo Scope
- 契約正本 repo：`aqutter_core`；最終修訂號 `rev 3`（介面：`layout.webRegions`、`AqutterNativeTouch.of(context)`；全文不進 archive，見 `aqutter_core` 的歸檔與程式碼）。
- 參與 repo 與 issue：`aqutter_core`（`Aqutter/aqutter_core#35`，契約與核心路由）、`aqutter-js`（`Aqutter/aqutter-js#20`，取樣回報 `webRegions`）、`aqutter-plugins`（`Aqutter/aqutter-plugins#12`，google-maps 宣告手勢）、`aqutter`（`Aqutter/aqutter#78`，殼轉出 `AqutterNativeTouch`）。共用計畫 ID `2611172358-ios-passthrough-drag-jitter`，共用分支名 `feature/2611172358-ios-passthrough-drag-jitter`。
- 執行順序相依：core 的契約凍結後 js、plugins、殼可平行；plugin 與殼的編譯依賴新 core 的 manifest ref（合併後同步）。建議合併次序：core → 殼 → js → plugins，之後 `aqutter` manifest、`aqutter-cli` snapshot、`aqutter-nuxt-app` 鎖定檔前進。

## Key Decisions
- **[調查]** iPad 實機與最新版確認：現行「網頁轉送手勢 → Dart → `moveCamera`」路徑拖地圖會抖；手指直接拖原生地圖不抖（模擬器合成 swipe 不能當判準）。
- **[根因的一半]** Flutter 手勢競技場把觸控判給最上層 WebView、封鎖地圖；但 UIKit 層的 hit test 也要讓路（整個 WebView 範圍的觸控先進它外層的容器），所以需要 Dart 與 UIKit 兩層配合。關掉 WKWebView 捲動追蹤的假設實驗沒有差別，已排除。
- **[設計]** 以觸控起點決定走原生或網頁：網頁端以 `document.elementFromPoint` 取樣回報 `webRegions`；core 把元素矩形扣掉網頁區域後的區域，一邊讓 Dart 的 `NativeTouchGate` 對 hit test 透明、一邊由 iOS `NativeTouchRouter`（window 最上層的透明 view，略過 WebView 外層 `ChildClippingView`）回傳底下的原生 view；plugin 在 `AqutterNativeTouch` 為真時讓原生 view 以 `EagerGestureRecognizer` 宣告手勢。只有 iOS，Android、macOS、Windows 與 mirror 不變；舊 client 不帶 `webRegions` 時行為不變。
- **[Q2]** spike 在 iPad 不過關就停下、只歸檔文件（實際 spike 與完整實作都在 iPad 實機過關，未觸發）。**[Q3]** 沒有 `pointer-events: none` 的網頁覆蓋層照 DOM 語意算網頁區域。
- **[契約變更]** rev 1 → rev 2：plugin 拿到的 context 來自殼套件，改由 core 以 `AqutterNativeTouch.of(context)` 提供，區域邊界歸屬改為不保證（±1px）。rev 2 → rev 3：plugin 只依賴殼，殼要轉出 `AqutterNativeTouch`（殼納入本計畫為第四個 repo，經使用者同意）。
- **[完成後]** commit + 開 PR（base main）；四個 repo 一起開。

## Deviations
- 與契約一致；契約從 rev 1 改到 rev 3（見 Key Decisions）對本 repo 無影響。
- 取樣只在 iOS 觸控環境啟用（契約允許不帶欄位表示不支援）。

## Impact Files
- `src/nativeview/webRegions.ts` (new) — 取樣、格子合併、數量上限
- `src/nativeview/layout.ts:12`（`AqutterNativeLayout.webRegions`）、`:69`（`trackLayout` 取樣節流與觸發）— 回報
- `src/nativeview/element.ts:174` — 只在 iOS 觸控啟用
- `src/nativeview/index.ts` — 匯出
- `test/nativeWebRegions.test.ts` (new) — 取樣、合併、上限、視窗裁切、節流、DOM 變動、停止
- `.kn-project/wiki/platform/native-element.md` — 新增「穿透時回報網頁區域」

## Wiki Changes

| 頁面 | 日期 | 版本 | 變動 | Issue | PR |
|---|---|---|---|---|---|
| `platform/native-element.md` | 2026-11-19 | — | iOS 穿透觸控直接進原生：layout 訊息新增 webRegions 取樣與回報 | [#20](https://github.com/Aqutter/aqutter-js/issues/20) | — |
