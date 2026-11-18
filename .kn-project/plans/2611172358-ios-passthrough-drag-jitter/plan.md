<!-- REMINDER: Relative Paths Only! No file:///c:/... -->
# Plan: 2611172358 - ios-passthrough-drag-jitter
- Created: 2026-11-18
- Branch: feature/2611172358-ios-passthrough-drag-jitter
- Issue: Aqutter/aqutter-js#20
- Milestone: N/A（未指定）
- Base Branch: main
- Status: In Progress
- Completed: [Wait for Finish]

## Goals
iOS 穿透時手指拖地圖會抖（網頁轉送手勢路徑，iPad 實機確認）。本 repo 的職責：在穿透元素的 `layout` 訊息新增 `webRegions`，回報元素矩形內「網頁要接管觸控」的區域，讓 `aqutter_core` 把其餘區域的觸控直接交給原生。完整設計、調查與 spike 結果見 `Aqutter/aqutter_core` 同名計畫（issue `Aqutter/aqutter_core#35`）。

## Architecture
- 取樣：在元素矩形（裁到視窗內）以 8 CSS px 為格，格中心 `document.elementFromPoint`；命中元素本身（或 shadow 內部，會重新指向宿主）、或沒有命中任何元素的格算原生，其餘算網頁。同類相鄰格合併成矩形；超過 64 個時改取每個橫帶的外框（保守：網頁區域只會變大），仍超過就用整體外框。
- 時機：與 `layout` 同一個排程；取樣另有節流（同一畫面最多一次、至少間隔 100ms，trailing），觸發為：強制送出、元素大小改變、祖先捲動與視窗改變、`document` 子樹的 DOM／class／style 變動、可見性改變。
- 只在 iOS 觸控環境（`isIosTouch()`）取樣與回報；其他環境不帶 `webRegions`（等同「不支援原生觸控」，core 本來也只在 iOS 啟用），避免白花取樣成本。
- 實作遵守 `kn-project-code-style`。

## Cross-Repo Scope
- **本計畫所屬 repo**: `aqutter-js`
- **共用計畫 ID**: `2611172358-ios-passthrough-drag-jitter`　**共用分支名**: `feature/2611172358-ios-passthrough-drag-jitter`
- **參與 repo 與職責**: `aqutter_core`（契約正本、核心路由，issue `Aqutter/aqutter_core#35`）、`aqutter-js`（本 repo，取樣回報，issue `Aqutter/aqutter-js#20`）、`aqutter-plugins`（`google-maps` 在原生觸控時宣告手勢，issue `Aqutter/aqutter-plugins#12`）。`aqutter` 殼不改。
- **執行順序相依**: core 的契約凍結後即可平行實作；本 repo 不依賴 core 的程式碼。
- **合併後的連動**: `aqutter` manifest 同步 js 新 ref、`aqutter-cli` snapshot、`aqutter-nuxt-app` 鎖定檔前進。

## Contract / 介面契約
- **契約正本 repo**: `aqutter_core`　**修訂號**: `rev 2`　**狀態**: `凍結（核准日 2026-11-18）`

### 1. 端點
本契約沒有 HTTP 端點。介面是既有的「網頁 → 原生」穿透訊息 `layout`（WebSocket JSON，`aqutter-js` 送、`aqutter_core` 收）新增一個欄位，加上 core 對 plugin 暴露一個旗標。

| # | 介面 | 方向 | 用途 |
|---|---|---|---|
| 1 | `layout` 訊息新增欄位 `webRegions` | `aqutter-js` → `aqutter_core` | 回報元素矩形內「網頁要接管觸控」的區域 |
| 2 | `AqutterNativeTouch.of(BuildContext)`（回傳 `ValueListenable<bool>`，`AqutterNative` 的 child 底下可讀；從 `package:aqutter_core/aqutter_core.dart` 匯出） | `aqutter_core` → plugin | 告訴 plugin 目前觸控是否直接進原生（plugin 據此在原生 view 的手勢競技場宣告） |

### 2. 欄位
**#1 `layout`（既有欄位不變，僅新增）**
| 欄位 | 型別 | 必填 | 可空 | 預設值 | 單位／格式 | 限制 | 資料來源 | 序列化 |
|---|---|---|---|---|---|---|---|---|
| `type` `left` `top` `width` `height` `visible` `sentAt` | 既有 | 是 | 否 | — | 既有 | 既有 | 元素 `getBoundingClientRect()` | 既有 |
| `webRegions` | `Array<{x:number,y:number,width:number,height:number}>` | 否 | 否（不支援原生觸控的 client 整個省略） | 省略 | CSS 像素，**相對元素左上角**（x、y 可為 0；不得超出 `0..width`／`0..height`） | 至多 64 個矩形、互不要求不重疊；寬高皆 > 0 的有限數；超過 64 個時 client 先合併相鄰格再送 | `document.elementFromPoint` 取樣：命中元素本身或其 shadow 內部＝原生，其餘＝網頁 | 支援原生觸控時**一律輸出**（沒有網頁區域時為 `[]`，不得省略）；與上一則相同的內容不重送（沿用 layout 的去重） |

**#2 `AqutterNativeTouch.of(context)`**
| 項目 | 規則 |
|---|---|
| 值 | `true` 僅當：平台為 iOS、該 session 為穿透、最近一則 `layout` 帶有 `webRegions`（含 `[]`）、且元素可見。其餘（含 Android、mirror、收到不帶 `webRegions` 的 `layout`、元素不可見）為 `false`。 |
| 預設 | `false`；`context` 之上沒有 `AqutterNative` 時回傳恆為 `false` 的 listenable |
| 時機 | 變化時通知；plugin 只據此切換手勢宣告，不自行猜測。 |

### 3. 錯誤碼
無。`webRegions` 格式不合（非陣列、元素缺欄位、負或非有限數、超過 64 個）時，core **忽略整個 `webRegions`**（視為未提供，維持現行行為），不影響 `left/top/width/height/visible` 的解析，不中斷連線。

### 4. 狀態與規則
- 原生觸控區域 = 元素矩形 − `webRegions` 聯集；落點在區域內才走原生。區域邊界上的點屬於哪一邊**不保證**（±1 邏輯像素內），client 取樣已以 8px 為格，不依賴邊界精度。
- 決定以**觸控起點**為準，序列中途不重新決定。
- `webRegions` 與元素移動／捲動同步：`layout` 每次送出都帶最新的區域（相對元素，所以元素單純平移時區域不變、不必重算）。
- 取樣時機：與 `layout` 同一個排程（動畫畫面、`ResizeObserver`、捲動、視窗改變）外，加上元素或其祖先子樹的 DOM／class／style 變動；取樣是相對昂貴的操作，**同一畫面最多一次**，且最多每 100ms 一次（trailing）。
- 取樣解析度：以 **8 CSS px** 為格，格中心取樣，相鄰同類格合併成矩形。
- 網頁覆蓋層一律視為「網頁」，包含沒有 `pointer-events: none` 的裝飾層（與目前行為一致：它們本來就會吃掉事件）。**已知限制**：Flutter 端疊在原生區域之上的 plugin 覆蓋層（非 HTML）在原生觸控區域內不會收到觸控。
- 冪等：`webRegions` 是完整快照，不是增量；後到的覆蓋先到的。

### 5. 相容性
- 舊 client（不送 `webRegions`）＋新 core：行為與現在完全相同（`nativeTouch` 恆為 `false`）。
- 新 client＋舊 core：舊 core 忽略未知欄位，行為與現在相同。
- Android、macOS、Windows、mirror 模式：不得有任何行為改變（Android 即使收到 `webRegions` 也不啟用）。
- 公開 API 只新增，不改既有簽名；`AqutterNativeLayout` 新增的 `webRegions` 欄位納入 `==`／`hashCode`。

### 6. 變更紀錄
- 2026-11-18　rev 1 → rev 2：(1) 介面 #2 由「`AqutterNativeContext.nativeTouch`」改為 `AqutterNativeTouch.of(context)`——plugin 實際拿到的 `AqutterPluginContext` 來自殼套件 `aqutter`，加欄位要動殼；改由 core 以 `InheritedNotifier` 提供，plugin 在 `AqutterNative` 的 child 內讀取，殼維持不動。(2) 區域邊界歸屬改為「不保證（±1px）」（原寫邊界屬於網頁，Dart `Rect.contains` 與 UIKit `CGRect.contains` 都是左上含、右下不含，無法逐字保證）。影響：`aqutter_core`（已依 rev 2 實作）、`aqutter-plugins`（讀取方式）；`aqutter-js` 不受影響。

## Impact Files
- `src/nativeview/layout.ts:12`（`AqutterNativeLayout`）、`:69`（`trackLayout`）— 新增 `webRegions` 欄位、取樣與合併、節流與觸發
- `src/nativeview/element.ts:174`（`trackLayout` 呼叫處）— 只在 iOS 觸控啟用取樣
- `src/nativeview/index.ts:9` — 匯出 `sampleWebRegions`
- `test/nativeLayout.test.ts` — 取樣、合併、上限、節流、非 iOS 不帶欄位的測試
- `.kn-project/wiki/platform/native-element.md` — 文件：`webRegions` 與觸控語意
- `.kn-project/archive/2611172358-ios-passthrough-drag-jitter.md` (new) — 歸檔

## App-Flow Screens
（無 `.kn-project/app-flow.json`，不適用。）

## Open Questions / 待確認事項
無（Q2、Q3 已於 `aqutter_core` 計畫決議：spike 失敗處理、網頁覆蓋層照 DOM 語意）。

## Manual Follow-ups / 人工收尾事項
- **[合併後]** `aqutter` 的 manifest 同步 js 新 ref，`aqutter-cli` snapshot 與 `aqutter-nuxt-app` 鎖定檔前進 — 這些在別的 repo 且需要先有本 PR 的 commit — agent 不代做。

## Key Decisions
- **[2026-11-18]** 使用者在 `aqutter_core` 計畫核准設計與契約（跨 repo 一併），spike 於 iPad 實機過關後建立本 repo 的 issue 與分支。
- **[完成後]** commit + 開 PR（base main）。

## Git Completion Policy
- PR 一律以 `--base main` 顯式指定 base (Rule 23)。每個 commit 訊息與 PR body 含 `Closes #20`；歸檔後於該 issue 張貼結案留言。

## References
- `Aqutter/aqutter_core` 的 `.kn-project/plans/2611172358-ios-passthrough-drag-jitter/plan.md`（契約正本與調查）
