# 2611031100 - file-picker-into-file-manager

- Created: 2026-11-03 11:00 / Archived: 2026-11-03
- Issue: N/A（本專案開發階段不建 issue）
- Milestone: N/A / Base Branch: main

## Summary
契約型別中內建 `picker_pick` 相關的介面與列舉（`PickerPick`、`PickerRequest`、`PickerResponse`、`FilePickerMode`、`FilePickerOptions`）標記 `@deprecated`，指引改用 `file-manager` 的 `fileManager.pick`。只加 JSDoc，不改行為、不移除匯出。

## Cross-Repo Scope
- 共用計畫 ID `2611031100-file-picker-into-file-manager`；各 repo 直接 `main`。
- 契約提供方是 `aqutter-plugins`（file-manager 新增 `pick`，先做）；`aqutter-nuxt-app` 改用 `pick`。
- 不在本計畫：殼 `aqutter` 移除 `picker_pick` 與 `file_picker` 依賴，另案。

## Key Decisions
- **[Q1]** 新增一次性 `pick`，`grant` 不變（契約正本在 `aqutter-plugins`）。
- **[Q2]** 本輪不動殼 — 先棄用、下一版再移除，避免對現有 App 的破壞性變更。

## Deviations
- 無契約變更。
- Wiki 與 README 檢查後沒有提到檔案選擇橋接，因此未改（wiki：`index.md`、`platform/*`）。

## Impact Files
- `src/contract/bridge.ts:85`（`PickerPick`）、`:439-447`（`PickerRequest`／`PickerResponse`）— `@deprecated`
- `src/contract/models/filePicker.ts`（`FilePickerMode`、`FilePickerOptions`）— `@deprecated`
- `src/contract/table.ts:139` — 確認棄用提示不破壞型別，未改
