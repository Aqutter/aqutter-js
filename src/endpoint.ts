/**
 * 殼注入的本機傳輸連線資訊：`window.aqutterEndpoint`（`{ port, token }`，已凍結）。
 *
 * 殼在頁面載入時以 UserScript 注入它；本機傳輸的伺服器重啟後埠與令牌都會換新，殼會重新定義這個全域。
 * 所以**每次連線前都重新讀取**，不得快取。它同時是「是否運行於殼內」的判斷依據。
 */
export interface Endpoint {
  port: number
  /** 本次啟動的隨機令牌；連線時以 query `token` 帶上。 */
  token: string
}

const read = (): Endpoint | undefined => {
  if (typeof window === 'undefined') {
    return undefined
  }
  return (window as unknown as { aqutterEndpoint?: Endpoint }).aqutterEndpoint
}

/** 殼是否已注入連線資訊（純瀏覽器與 SSR 為 false）。 */
export const hasEndpoint = (): boolean => read() !== undefined

/** 取得目前的連線資訊；殼尚未注入、或內容不合法時 reject。每次呼叫都重新讀取。 */
export const getEndpoint = async (): Promise<Endpoint> => {
  const endpoint = read()
  if (endpoint === undefined) {
    throw new Error('window.aqutterEndpoint is not available')
  }
  if (typeof endpoint.port !== 'number' || typeof endpoint.token !== 'string') {
    throw new Error('window.aqutterEndpoint is malformed')
  }
  return endpoint
}
