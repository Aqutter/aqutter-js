# 殼內建能力

## Summary
殼內建的剪貼簿（文字與圖片）、系統分享、本機通知與深層連結四組能力，在網頁端是四個內建 plugin（`clipboard`、`share`、`notification`、`deeplink`），用一般 plugin 的 `callPlugin`、`onPluginEvent`、`isPluginSupported` 呼叫並有完整型別，不新增執行期程式碼。方法名稱為 `<id>.<method>`、事件為 `<id>.<event>`，必須與殼的 plugin 逐字相同；不支援的平台不會列入能力表；用不了的呼叫回 undefined 而不是拋錯（開發階段警告一次），所以呼叫端要處理 undefined。契約正本在殼的 repo。

## 運作方式

### 能力一覽

網頁用 `callPlugin` 呼叫方法、`onPluginEvent` 訂閱事件、`isPluginSupported` 判斷是否可用，參數依序是 plugin id、方法或事件名，以及請求或監聽函式。

| Plugin.方法 | 做什麼 | 平台 |
|---|---|---|
| `clipboard.read` | 讀剪貼簿文字，沒有文字回 null | 全部 |
| `clipboard.write` | 寫入剪貼簿文字 | 全部 |
| `clipboard.readImage` | 讀剪貼簿圖片，一律以 PNG 回傳 | Android、iOS、macOS、Windows |
| `clipboard.writeImage` | 寫入 PNG 或 JPEG 圖片 | Android、iOS、macOS、Windows |
| `share.open` | 開啟系統分享面板，可帶文字、網址、檔案 | 全部 |
| `notification.show` | 立即顯示本機通知 | Android、iOS、macOS |
| `notification.schedule` | 以絕對時間點排程通知，非精確 | Android、iOS、macOS |
| `notification.cancel` | 取消指定通知，省略編號取消全部 | Android、iOS、macOS |
| `notification.initial` | 取得點通知而冷啟 App 的通知資訊 | Android、iOS、macOS |
| `deeplink.initial` | 取得啟動 App 的連結，同一程序內重複呼叫結果相同 | Android、iOS、macOS |

| Plugin 事件 | 酬載 | 觸發 |
|---|---|---|
| `notification.tapped` | 通知編號與自訂酬載 | App 執行中使用者點了通知 |
| `deeplink.received` | 連結網址 | App 執行中收到新的連結 |

型別由 `BuiltinPluginRegistry` 併入 `AqutterPluginRegistry`，所以方法名、請求與回應型別、事件酬載都有編輯器提示與型別檢查。

來源：1. [builtinPlugins.ts](../../../src/contract/builtinPlugins.ts#L39-L96)　2. [bridge.ts](../../../src/contract/bridge.ts#L327-L456)

### 冷啟與執行中的取得方式

這張圖回答：通知與連結在 App 冷啟和執行中，各從哪條路到網頁？

```json diagram id=冷啟與執行中
{
  "type": "flow", "dir": "TD", "title": "通知與連結到達網頁的兩條路", "desc": "冷啟時網頁主動拉取一次性資訊，執行中則由殼推送事件",
  "nodes": [
    {"id": "a", "text": "使用者點通知\n或開啟連結", "kind": "start"},
    {"id": "b", "text": "App 已在執行?", "shape": "diamond"},
    {"id": "c", "text": "殼推送事件", "kind": "bus"},
    {"id": "d", "text": "網頁訂閱\n事件取得", "key": true},
    {"id": "e", "text": "殼啟動 App"},
    {"id": "f", "text": "網頁連線後\n主動拉取", "key": true}
  ],
  "edges": [
    {"from": "a", "to": "b"},
    {"from": "b", "to": "c", "label": "是"},
    {"from": "c", "to": "d", "kind": "evt"},
    {"from": "b", "to": "e", "label": "否"},
    {"from": "e", "to": "f", "label": "拉取", "kind": "async"}
  ]
}
```

![通知與連結到達網頁的兩條路](builtin-capabilities.冷啟與執行中.svg)

1. App 執行中，殼把點通知或收到連結轉成事件推給網頁，網頁訂閱事件即可。
2. App 冷啟時網頁尚未連線，事件會被丟棄，所以啟動它的通知與連結只能主動拉取。
3. 拉取用的兩個方法（`notification.initial`、`deeplink.initial`）在同一程序內可重複呼叫，結果不變。
4. 啟動 App 的那一個連結不會再走事件，避免重複處理。

來源：1. [builtinPlugins.ts](../../../src/contract/builtinPlugins.ts#L62-L89)　2. [bridge.ts](../../../src/contract/bridge.ts#L407-L456)

## 規則

| 規則 | 說明 |
|---|---|
| 名稱成對 | plugin id、方法與事件名必須與殼的內建 plugin 逐字相同，只改一邊就是錯 |
| 保留 id | `clipboard`、`share`、`notification`、`deeplink` 是內建 plugin id，使用者 plugin 不得同名 |
| 先判斷支援 | 不支援的平台不列入能力表（`isPluginSupported` 回 false）；能力表尚未取得時視為支援 |
| 用不了不報錯 | 不支援的平台、App 沒裝該 plugin、不在 Flutter 內時，呼叫回 undefined 而不是拋錯，回傳型別因此含 undefined，呼叫端必須處理；開發階段在 console 警告一次，正式版完全安靜。plugin 自己的錯誤碼與傳輸錯誤仍照常拋出 |
| 通知權限 | 通知方法不會自己彈授權視窗，網頁先用既有權限 handler 取得權限，否則回 permission_denied |
| 排程精度 | 以絕對時間點排程，系統可能延後數分鐘；排程時間必須晚於現在，否則回 invalid_argument |
| 分享限制 | 文字、網址、主旨各 ≤ 10,000 字；檔案最多 5 個、各 ≤ 5,242,880 位元組 |
| 剪貼簿限制 | 文字 ≤ 1,000,000 單元；圖片 ≤ 5,242,880 位元組，讀取超過回 too_large，不截斷 |
| 通知欄位 | 標題 1 至 200 字必填，內文 ≤ 2,000 字，自訂酬載 ≤ 1,000 字，殼原樣帶回 |
| 連結驗證 | 殼不過濾收到的連結，網頁必須自行驗證再導航 |
| Linux 圖片剪貼簿 | 不支援，不列入能力表 |
| 未收錄 | 推播、生物辨識、安全儲存不在這組能力內 |

來源：1. [bridge.ts](../../../src/contract/bridge.ts#L327-L456)　2. [builtinPlugins.ts](../../../src/contract/builtinPlugins.ts#L39-L96)

---
[🏠 Wiki](../index.md)
