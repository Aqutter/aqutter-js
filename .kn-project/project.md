<!-- REMINDER: Relative Paths Only! No file:///c:/... -->
# aqutter-js

Aqutter 殼的網頁端 client：npm 套件 `@aqutter/aqutter`，框架中立（不依賴 Nuxt／Vite 等），提供 bridge 呼叫、事件訂閱、plugin API、native view 鏡像與跨層契約型別。以 TypeScript 原始碼發佈，由使用端打包器編譯。詳見 [README.md](../README.md)。

## 保留鐵則

- **跨語言名稱成對（跨 repo）**：handler／事件名稱在 `src/contract/bridge.ts`，對應 `Aqutter/aqutter` 的 `shell/lib/src/bridge/bridge_names.dart`；plugin 命名規則在 `src/index.ts`，對應 `shell/lib/src/plugin/aqutter_plugin.dart`；只改一邊就是錯。
- **鏡像協定兩端成對**：`src/nativeview/{frame,gestures}.ts` 對應 `Aqutter/aqutter_core` 的 `native_frame.dart`。
- **版本對應以 manifest 為準**：改動後要更新 `Aqutter/aqutter` 的 `manifest/releases.json` 的 `client.spec`（commit sha）。
- **傳輸成對**：`src/frame.ts` 的訊框格式與 `Aqutter/aqutter_core` 的 `rpc_frame.dart` 成對，兩端以 `test/rpc_frame_vectors.json`（與 core 逐字相同）保持一致；連線路徑 `/channel/aqutter.rpc`。呼叫與事件都走這條連線；連線資訊（埠與令牌）由殼在頁面載入時注入 `window.aqutterEndpoint`（`src/endpoint.ts`，每次連線前重新讀取），client 不使用 `callHandler`。
- **套件名不改**：`@aqutter/aqutter`。
- **`aqutterError` 是保留欄位**：殼對 plugin 呼叫失敗（例如不支援本平台）回傳 `{ aqutterError: { code, message } }`，`callPlugin` 轉成 `AqutterPluginError`；plugin 自己的回傳不得使用這個欄位名。
- **安裝**：`github:Aqutter/aqutter-js#<ref>`（repo 根目錄；npm、pnpm、yarn 皆可，bun 尚未驗證）。開發階段版本 tag `0.0.0` 隨 `main` 前進。
- **開發階段直接推送 `main`**，不開 PR／milestone／版本分支（本 repo 目前如此）。

## 驗證

```bash
pnpm install
pnpm typecheck
pnpm test
```

已驗證：typecheck、111 個單元測試；npm、pnpm、yarn 可從 GitHub 安裝。
