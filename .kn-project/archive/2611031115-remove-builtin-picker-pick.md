# 2611031115 - remove-builtin-picker-pick

- Created: 2026-11-03 11:15 / Archived: 2026-11-03
- Issue: N/A（本專案開發階段不建 issue）
- Milestone: N/A / Base Branch: main

## Summary
移除已棄用的內建檔案選擇契約型別（`BridgeHandler.PickerPick`、`PickerRequest`、`PickerResponse`、`FilePickerMode`、`FilePickerOptions`），對應殼已移除 `picker_pick`。選檔改用 file-manager plugin 的 `fileManager.pick`。這是破壞性的型別變更。

## Cross-Repo Scope
- 共用計畫 ID `2611031115-remove-builtin-picker-pick`；各 repo 直接 `main`。
- `aqutter`（殼）移除處理器與依賴，與本 repo 名稱成對；`aqutter-nuxt-app` 重新對齊。
- 前置計畫：`2611031100-file-picker-into-file-manager`（已歸檔）。

## Key Decisions
- **[範圍]** 型別與殼一併移除 — 使用者選擇；先前只棄用的計畫已讓使用者有遷移指引。

## Deviations
- 無契約變更。`tsc --noEmit` 與 166 個測試通過；本 repo 沒有 `lint` 指令，未跑。
- Wiki 與 README 檢查後沒有提到檔案選擇橋接，因此未改。

## Impact Files
- `src/contract/bridge.ts:85`、`:439-447` — 刪 `PickerPick`、`PickerRequest`、`PickerResponse`
- `src/contract/table.ts:139` — 刪對應表項目
- `src/contract/index.ts`、`src/contract/models/filePicker.ts` — 刪除檔案與匯出
