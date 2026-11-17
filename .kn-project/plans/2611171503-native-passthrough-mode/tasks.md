# Tasks for 2611171503

## Phase 1 — 追蹤與偵測（純邏輯）
- [ ] [aqutter-js] `layout.ts`：矩形追蹤（每畫面最多一則、忽略相同值）與 `pageReady` 偵測，單元測試　依賴 Contract §2 #2、#4

## Phase 2 — 協商與元素
- [ ] [aqutter-js] `native.ts`：`mode` 請求／回覆、1000 ms 逾時退回鏡像、`layout` 送出　依賴 Contract §2、§3
- [ ] [aqutter-js] `element.ts`：`mode` 屬性、穿透時不建立 canvas、`aqutter-mode` 事件、屬性改變時重新協商
- [ ] [aqutter-js] 型別匯出；`pnpm lint`、`pnpm test`、型別檢查

## Phase 3 — 整合驗證
- [ ] [aqutter-js] 需等待 [aqutter_core]：原生端協議完成後，在 Android 實機以兩種模式各跑一次，確認切換、退回與 `aqutter-mode` 事件
