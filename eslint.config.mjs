// @ts-check
import { createConfigForNuxt } from '@nuxt/eslint-config/flat'

export default createConfigForNuxt({
  // 純 TS 函式庫，沒有 Vue；規則與 aqutter-nuxt-app 一致
  features: { stylistic: true, tooling: false },
}).append({
  // 治理文件與 wiki 產物不是原始碼
  ignores: ['.kn-project/**'],
}, {
  rules: {
    'no-unused-vars': 'off',
    '@typescript-eslint/no-unused-vars': 'off',
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-empty-object-type': 'off',
    'no-empty': 'off',
    '@stylistic/brace-style': ['error', 'stroustrup', { allowSingleLine: true }],
  },
})
