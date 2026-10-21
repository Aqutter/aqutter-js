/**
 * 原始指標事件：把瀏覽器的 pointer 事件正規化後原樣轉給原生端，由 Flutter 注入成真的指標事件，
 * 讓被鏡像的 widget 直接用標準的 `GestureDetector`／地圖手勢，行為與原生 Flutter App 一致。
 *
 * 與 {@link GestureRecognizer} 的語意手勢（tap／pan／pinch）不同：這裡不做任何判斷，只轉送。
 * 座標為 0..1 的正規化值（相對元素大小），`t` 為事件的硬體時間戳（毫秒，`event.timeStamp`）。
 */

export type AqutterNativePointerPhase = 'down' | 'move' | 'up' | 'cancel'

export interface AqutterNativePointer {
  type: 'pointer'
  phase: AqutterNativePointerPhase
  /** 瀏覽器的 pointerId；原生端會對應成不衝突的內部 id。 */
  id: number
  x: number
  y: number
  t: number
  pointerType: string
}

/** 事件中用得到的欄位（`PointerEvent` 的子集，方便測試）。 */
export interface PointerLike {
  pointerId: number
  clientX: number
  clientY: number
  timeStamp: number
  pointerType: string
}

/** 把 pointer 事件轉成要送給原生端的訊息；座標以元素左上角為原點、除以元素大小。 */
export const toPointerMessage = (
  phase: AqutterNativePointerPhase,
  event: PointerLike,
  rect: { left: number, top: number },
  size: { width: number, height: number },
): AqutterNativePointer => ({
  type: 'pointer',
  phase,
  id: event.pointerId,
  x: size.width > 0 ? (event.clientX - rect.left) / size.width : 0,
  y: size.height > 0 ? (event.clientY - rect.top) / size.height : 0,
  t: event.timeStamp,
  pointerType: event.pointerType,
})
