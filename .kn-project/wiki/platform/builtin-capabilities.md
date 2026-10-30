# 殼內建能力

## Summary
殼內建的剪貼簿（文字與圖片）、系統分享、本機通知與深層連結四組能力，在網頁端以型別安全的 handler 與兩個事件提供，沿用既有的呼叫與訂閱函式，不新增執行期程式碼。名稱必須與殼的名稱常數逐字相同；不支援的平台不會列入能力表，網頁以支援判斷函式先確認再呼叫。契約正本在殼的 repo。

## 運作方式

### 能力一覽

| Handler | 做什麼 | 平台 |
|---|---|---|
| `clipboard_read` | 讀剪貼簿文字，沒有文字回 null | 全部 |
| `clipboard_write` | 寫入剪貼簿文字 | 全部 |
| `clipboard_read_image` | 讀剪貼簿圖片，一律以 PNG 回傳 | Android、iOS、macOS、Windows |
| `clipboard_write_image` | 寫入 PNG 或 JPEG 圖片 | Android、iOS、macOS、Windows |
| `share_open` | 開啟系統分享面板，可帶文字、網址、檔案 | 全部 |
| `notify_show` | 立即顯示本機通知 | Android、iOS、macOS |
| `notify_schedule` | 以絕對時間點排程通知，非精確 | Android、iOS、macOS |
| `notify_cancel` | 取消指定通知，省略編號取消全部 | Android、iOS、macOS |
| `notify_initial` | 取得點通知而冷啟 App 的通知資訊 | Android、iOS、macOS |
| `deeplink_initial` | 取得啟動 App 的連結，同一程序內重複呼叫結果相同 | Android、iOS、macOS |

| 事件 | 酬載 | 觸發 |
|---|---|---|
| `notify_tapped` | 通知編號與自訂酬載 | App 執行中使用者點了通知 |
| `deep_link` | 連結網址 | App 執行中收到新的連結 |

來源：1. [bridge.ts](../../../src/contract/bridge.ts#L77-L101)　2. [bridge.ts](../../../src/contract/bridge.ts#L226-L229)　3. [table.ts](../../../src/contract/table.ts#L150-L162)

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
3. 拉取用的兩個 handler 在同一程序內可重複呼叫，結果不變。
4. 啟動 App 的那一個連結不會再走事件，避免重複處理。

來源：1. [bridge.ts](../../../src/contract/bridge.ts#L226-L229)　2. [bridge.ts](../../../src/contract/bridge.ts#L435-L456)

## 規則

| 規則 | 說明 |
|---|---|
| 名稱成對 | 名稱必須與殼的名稱常數逐字相同，只改一邊就是錯 |
| 先判斷支援 | 不支援的平台不列入能力表，呼叫會得到不支援平台的錯誤 |
| 通知權限 | 通知 handler 不會自己彈授權視窗，網頁先用既有權限 handler 取得權限，否則回 permission_denied |
| 排程精度 | 以絕對時間點排程，系統可能延後數分鐘；排程時間必須晚於現在，否則回 invalid_argument |
| 分享限制 | 文字、網址、主旨各 ≤ 10,000 字；檔案最多 5 個、各 ≤ 5,242,880 位元組 |
| 剪貼簿限制 | 文字 ≤ 1,000,000 單元；圖片 ≤ 5,242,880 位元組，讀取超過回 too_large，不截斷 |
| 通知欄位 | 標題 1 至 200 字必填，內文 ≤ 2,000 字，自訂酬載 ≤ 1,000 字，殼原樣帶回 |
| 連結驗證 | 殼不過濾收到的連結，網頁必須自行驗證再導航 |
| Linux 圖片剪貼簿 | 不支援，不列入能力表 |
| 未收錄 | 推播、生物辨識、安全儲存不在這組能力內 |

來源：1. [bridge.ts](../../../src/contract/bridge.ts#L355-L456)　2. [table.ts](../../../src/contract/table.ts#L150-L162)

---
[🏠 Wiki](../index.md)
