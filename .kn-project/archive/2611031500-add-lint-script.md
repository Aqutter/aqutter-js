# 2611031500 - add-lint-script

- Created: 2026-11-03 15:00 / Archived: 2026-11-03
- Issue: N/A（本專案開發階段不建 issue）
- Milestone: N/A / Base Branch: main

## Summary
`aqutter-js` 新增 `lint` 與 `fix` 腳本（`@nuxt/eslint-config` 的 stylistic 規則，自訂規則與 `aqutter-nuxt-app` 一致），並修完現有的 14 個違規。契約型別中的無酬載 `req: void` 全部改為 `req: undefined`；`callPlugin` 的判斷同步改為 `undefined`，宣告 `req: void` 的舊 plugin 仍可不帶參數呼叫。

## Cross-Repo Scope
無（單一 repo）。

## Key Decisions
- **[設計]** 規則與 `aqutter-nuxt-app` 一致 — 同一套程式碼風格。
- **[Q1]** `void` 全部改成 `undefined`（`NoPayload`）— 使用者選擇；規則保留，並新增型別測試確認舊寫法 `req: void` 仍能不帶參數呼叫。
- **[範圍]** `.kn-project/**` 不 lint — 那是 wiki 產物，不是原始碼。

## Deviations
- 無契約偏離；`req: void` → `req: undefined` 屬型別層級調整，宣告 `void` 的外部 plugin 相容。
- 驗證：`pnpm lint`、`pnpm typecheck` 通過；166 個測試全過。
- 未驗證：`aqutter-plugins`、`aqutter-nuxt-app` 尚未升級到含本次變更的 `aqutter-js`，下游型別檢查沒有針對新版重跑。
- `0.0.0` tag 未移動，`aqutter` 的 manifest `client.spec` 與下游鎖定點仍指向舊提交。

## Impact Files
- `package.json`、`pnpm-lock.yaml` — `lint`／`fix` 腳本與 `eslint`、`@nuxt/eslint-config`
- `eslint.config.mjs` (new) — flat config
- `src/contract/builtinPlugins.ts`、`src/index.ts`、`test-types/plugin-types.ts` — `void` → `undefined`、相容測試
- `src/contract/table.ts`、`src/nativeview/element.ts`、`src/nativeview/gestures.ts`、`src/nativeview/native.ts`、`test/bridgeCapabilities.test.ts` — 格式修正
