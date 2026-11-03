# Plan: 2611031500 - add-lint-script
- Created: 2026-11-03
- Branch: N/A（直接 main）
- Issue: N/A（無 issue 追蹤基準）
- Milestone: N/A（未指定）
- Base Branch: main
- Status: Awaiting Archive
- Completed: [Wait for Finish]

## Goals
`aqutter-js` 補上 `lint` 與 `fix` 腳本，規則與 `aqutter-nuxt-app` 一致（`@nuxt/eslint-config` 的 stylistic 規則加同一組自訂規則），並把現有的違規修到 `pnpm lint` 通過。

## Architecture
- 以 `@nuxt/eslint-config/flat` 的 `createConfigForNuxt({ features: { stylistic: true, tooling: false } })` 建立 flat config；`tooling: false` 因為這是純 TS 函式庫，不含 Vue。
- 自訂規則沿用 nuxt-app：關閉 `no-explicit-any`、`no-empty-object-type`、`no-unused-vars`、`no-empty`，`brace-style` 用 stroustrup。
- 先在暫存副本實測：現有程式碼共 15 個問題（14 error、1 warning），其中 5 error 與 1 warning 可 `--fix`。

## Cross-Repo Scope
無（單一 repo）。

## Contract / 介面契約
無（單一 repo）。

## Impact Files
- `package.json:13` (`scripts`) — 新增 `lint`、`fix`；`devDependencies` 新增 `eslint`、`@nuxt/eslint-config`
- `pnpm-lock.yaml` — 隨依賴更新
- `eslint.config.mjs` (new) — flat config
- `src/contract/builtinPlugins.ts:42,46,70,82` — `void` 型別（`no-invalid-void-type`，視 Q1）
- `src/contract/table.ts:137` — 多餘空行
- `src/index.ts:237` — 無用的 eslint-disable 指令；`:303` — `void`（視 Q1）
- `src/nativeview/element.ts:144,270,320` — 縮排與一行多敘述
- `src/nativeview/gestures.ts:18`、`src/nativeview/native.ts:17` — `=` 換行位置
- `test/bridgeCapabilities.test.ts:11` — 一行多敘述
- `test-types/plugin-types.ts:10,26` — `void`（視 Q1）、`@ts-expect-error` 需要說明文字

## Open Questions / 待確認事項
### Q1. 契約型別裡的 `void`（`req: void`）— 影響範圍：`builtinPlugins.ts`、`index.ts`、`plugin-types.ts`
- [ ] 關閉 `@typescript-eslint/no-invalid-void-type`　(未採用；建議，理由：`req: void` 是已公開的 plugin 契約寫法，改成 `undefined` 會動到對外型別)
- [x] 全部改成 `NoPayload`（`undefined`）
- **決議**：全部改成 `undefined`（`NoPayload`）　狀態：✅ 已確認

## Manual Follow-ups / 人工收尾事項
- **[合併後]** 把 `aqutter-js` 的 `0.0.0` tag 移到最新 `main`，並更新 `aqutter` 的 manifest `client.spec`、`aqutter-nuxt-app` 與 `aqutter-plugins` 的 lock — 需要使用者同意強推 tag；若只動 lint 與格式、不改對外型別，可以不移動 tag，由使用者決定

## Key Decisions
- **[設計]** 規則與 `aqutter-nuxt-app` 一致 — 理由：同一套程式碼風格，貢獻者不用切換規則。

- **[Q1]** 契約型別的 `void` 全部改成 `undefined`（`NoPayload`）— 使用者選擇；規則保留，需確認不破壞對外型別與既有型別測試。

## Git Completion Policy
- 開發階段直接推送 `main`，不開 PR／issue／milestone。commit 一律自動。

## References
- 對話：2026-11-03 發佈前檢查，缺 lint 腳本
