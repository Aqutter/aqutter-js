/** 檔案選擇模式。 */
export enum FilePickerMode {
  /** 單一檔案。 */
  File = 'file',
  /** 多個檔案。 */
  Files = 'files',
  /** 資料夾。 */
  Directory = 'directory',
}

/** 檔案選擇選項（對應 Flutter file_picker）。 */
export interface FilePickerOptions {
  /** 允許的副檔名（不含點，如 ['pdf', 'png']）；未指定為不限。 */
  extensions?: string[]
  /** 對話框標題。 */
  title?: string
}
