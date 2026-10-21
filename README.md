# @aqutter/aqutter

Aqutter 殼的網頁端 client：框架中立（不依賴 Nuxt / Vite 等），提供

- `isFlutter()`、`callFlutter(handler, payload)`、`onFlutterEvent(channel, listener)`：呼叫殼內建 handler、訂閱事件
- `isBridgeSupported(handler)`：本平台是否真的做得到
- Plugin API：`callPlugin`、`onPluginEvent`、`isPluginSupported`（型別由各 plugin 併入 `AqutterPluginRegistry`）
- Native view 鏡像：`import '@aqutter/aqutter/native'` 註冊 `<aqutter-native>`，或用 `AqutterNative` 自行繪製（見 [Aqutter 文件的 nativeview](https://github.com/Aqutter/aqutter/blob/main/docs/nativeview.md)）
- `@aqutter/aqutter/contract`：handler / 事件名稱與 payload 型別（與 `shell` 的 `bridge_names.dart` 成對）

以 TypeScript 原始碼發佈，由使用端打包器編譯。npm、pnpm、yarn 皆可安裝（bun 尚未驗證）：

```bash
npm i github:Aqutter/aqutter-js#0.0.0
```

```bash
pnpm add github:Aqutter/aqutter-js#0.0.0
```

```bash
yarn add github:Aqutter/aqutter-js#0.0.0
```

使用與 plugin 開發見 [Aqutter 文件](https://github.com/Aqutter/aqutter/tree/main/docs)。CLI 在 [`Aqutter/aqutter-cli`](https://github.com/Aqutter/aqutter-cli)。
