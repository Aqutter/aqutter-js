/**
 * 穿透模式的頁面背景處理：讓使用端不必自己清背景、挖洞。
 *
 * 穿透時原生內容畫在（透明的）WebView 下面，元素後方任何不透明的 HTML 都會蓋住它。這個模組在穿透期間做兩件事，
 * 離開穿透（退回鏡像、斷線、元素移除）時全部還原：
 *
 * 1. 元素往上到 `<html>` 的祖先，不透明的 `background-color`／`background-image` 暫時改成透明（行內、`!important`）。
 * 2. 標了 `data-aqutter-bg` 的底層背景層（例如鋪滿整個畫面的 `fixed inset-0` 背景），用 CSS `mask` 在元素的位置挖洞，
 *    洞的圓角取自元素的 `border-radius`，跟著元素的矩形更新（由 {@link trackLayout} 的每幀回報驅動）。
 *
 * 頁面不想要時，在元素上加 `keep-background` 屬性（由元素決定，見 `element.ts`），這個模組就不會啟動。
 */
import { cssColorAlpha, OPAQUE_ALPHA } from './layout'
import type { AqutterNativeLayout } from './layout'

/** 標記「全螢幕底層背景層」的屬性：穿透時會在元素的位置挖洞。標記的層不可以是元素的祖先（遮罩會連元素一起遮掉）。 */
export const AQUTTER_BG_ATTRIBUTE = 'data-aqutter-bg'

export interface AqutterSeeThrough {
  /** 元素的矩形變了（每次 `layout` 回報都呼叫）：更新所有標記層的洞。 */
  update: (layout: AqutterNativeLayout) => void
  /** 停止並還原所有改動。 */
  stop: () => void
}

/** 一個行內樣式屬性被覆寫前的狀態，供還原。 */
interface SavedProperty {
  name: string
  value: string
  priority: string
}

const save = (style: CSSStyleDeclaration, names: readonly string[]): SavedProperty[] =>
  names.map(name => ({ name, value: style.getPropertyValue(name), priority: style.getPropertyPriority(name) }))

const restore = (style: CSSStyleDeclaration, saved: readonly SavedProperty[]): void => {
  for (const { name, value, priority } of saved) {
    if (value === '') {
      style.removeProperty(name)
    }
    else {
      style.setProperty(name, value, priority)
    }
  }
}

/** 元素的上一層：一般的父元素，或跨過 shadow DOM 邊界的宿主（與 `detectPageReady` 的走法一致）。 */
const parentOf = (node: Element): Element | null => {
  if (node.parentElement) {
    return node.parentElement
  }
  const root = node.getRootNode()
  return root instanceof ShadowRoot ? root.host : null
}

const styleOf = (node: Element): CSSStyleDeclaration | null => {
  const style = (node as HTMLElement).style
  return style && typeof style.setProperty === 'function' ? style : null
}

const CLEAR_PROPERTIES = ['background-color', 'background-image'] as const

/** 把 [element] 往上的祖先中，會蓋住後方的不透明背景改成透明。回傳還原函式。 */
export const clearAncestorBackgrounds = (element: Element): (() => void) => {
  const restores: (() => void)[] = []
  for (let node = parentOf(element); node; node = parentOf(node)) {
    const style = styleOf(node)
    if (!style) {
      continue
    }
    const computed = getComputedStyle(node)
    const names: string[] = []
    if (cssColorAlpha(computed.backgroundColor) >= OPAQUE_ALPHA) {
      names.push('background-color')
    }
    if (computed.backgroundImage && computed.backgroundImage !== 'none') {
      names.push('background-image')
    }
    if (names.length === 0) {
      continue
    }
    const saved = save(style, CLEAR_PROPERTIES)
    for (const name of names) {
      style.setProperty(name, name === 'background-image' ? 'none' : 'transparent', 'important')
    }
    restores.push(() => restore(style, saved))
  }
  return () => restores.forEach(run => run())
}

const MASK_PROPERTIES = [
  'mask-image',
  'mask-size',
  'mask-position',
  'mask-repeat',
  'mask-composite',
  '-webkit-mask-image',
  '-webkit-mask-size',
  '-webkit-mask-position',
  '-webkit-mask-repeat',
  '-webkit-mask-composite',
] as const

/** 四個角的半徑（px），順序：左上、右上、右下、左下。 */
export type CornerRadii = [number, number, number, number]

const radiusPx = (value: string, basis: number): number => {
  const first = value.trim().split(/\s+/)[0] ?? ''
  const number = Number.parseFloat(first)
  if (!Number.isFinite(number)) {
    return 0
  }
  return first.endsWith('%') ? (number / 100) * basis : number
}

/** 讀元素的 `border-radius`（各角分開、支援 px 與 %），並限制在不超過寬高一半。 */
export const readCornerRadii = (element: Element, width: number, height: number): CornerRadii => {
  const style = getComputedStyle(element)
  const limit = Math.min(width, height) / 2
  const clamp = (value: number): number => Math.max(0, Math.min(value, limit))
  return [
    clamp(radiusPx(style.borderTopLeftRadius, width)),
    clamp(radiusPx(style.borderTopRightRadius, width)),
    clamp(radiusPx(style.borderBottomRightRadius, width)),
    clamp(radiusPx(style.borderBottomLeftRadius, width)),
  ]
}

/** 圓角矩形的 SVG（黑色填滿），當作 mask 的「洞」。 */
export const roundedRectSvg = (width: number, height: number, [tl, tr, br, bl]: CornerRadii): string => {
  const w = +width.toFixed(2)
  const h = +height.toFixed(2)
  const path = `M${tl} 0H${w - tr}A${tr} ${tr} 0 0 1 ${w} ${tr}V${h - br}A${br} ${br} 0 0 1 ${w - br} ${h}H${bl}A${bl} ${bl} 0 0 1 0 ${h - bl}V${tl}A${tl} ${tl} 0 0 1 ${tl} 0Z`
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><path d="${path}" fill="#000"/></svg>`
}

const holeMask = (svg: string, x: number, y: number, width: number, height: number): Record<string, string> => {
  const image = `linear-gradient(#000, #000), url("data:image/svg+xml,${encodeURIComponent(svg)}")`
  const size = `100% 100%, ${+width.toFixed(2)}px ${+height.toFixed(2)}px`
  const position = `0 0, ${+x.toFixed(2)}px ${+y.toFixed(2)}px`
  return {
    'mask-image': image,
    'mask-size': size,
    'mask-position': position,
    'mask-repeat': 'no-repeat',
    'mask-composite': 'exclude',
    '-webkit-mask-image': image,
    '-webkit-mask-size': size,
    '-webkit-mask-position': position,
    '-webkit-mask-repeat': 'no-repeat',
    '-webkit-mask-composite': 'xor',
  }
}

/** 開始處理：祖先背景立刻清掉；標記層在每次 [AqutterSeeThrough.update] 依矩形挖洞。 */
export const startSeeThrough = (element: Element): AqutterSeeThrough => {
  const restoreAncestors = clearAncestorBackgrounds(element)
  const layers = new Map<Element, SavedProperty[]>()
  let last: AqutterNativeLayout | null = null
  let stopped = false

  const isAncestor = (layer: Element): boolean => {
    for (let node = parentOf(element); node; node = parentOf(node)) {
      if (node === layer) {
        return true
      }
    }
    return false
  }

  const apply = (layer: Element, layout: AqutterNativeLayout): void => {
    const style = styleOf(layer)
    if (!style) {
      return
    }
    if (!layers.has(layer)) {
      layers.set(layer, save(style, MASK_PROPERTIES))
    }
    const saved = layers.get(layer)!
    if (!layout.visible || layout.width <= 0 || layout.height <= 0) {
      restore(style, saved)
      return
    }
    const box = layer.getBoundingClientRect()
    const radii = readCornerRadii(element, layout.width, layout.height)
    const mask = holeMask(roundedRectSvg(layout.width, layout.height, radii), layout.left - box.left, layout.top - box.top, layout.width, layout.height)
    for (const [name, value] of Object.entries(mask)) {
      style.setProperty(name, value)
    }
  }

  const update = (layout: AqutterNativeLayout): void => {
    if (stopped) {
      return
    }
    last = layout
    const found = Array.from(document.querySelectorAll(`[${AQUTTER_BG_ATTRIBUTE}]`)).filter(layer => layer !== element && !isAncestor(layer))
    for (const layer of found) {
      apply(layer, layout)
    }
    // 不再被標記的層（屬性被拿掉）要還原
    for (const [layer, saved] of layers) {
      if (!found.includes(layer)) {
        const style = styleOf(layer)
        if (style) {
          restore(style, saved)
        }
        layers.delete(layer)
      }
    }
  }

  // 標記層增減、屬性變動時，用最近一次的矩形重算
  const observer = typeof MutationObserver === 'function'
    ? new MutationObserver(() => {
        if (last) {
          update(last)
        }
      })
    : null
  observer?.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: [AQUTTER_BG_ATTRIBUTE] })

  return {
    update,
    stop: () => {
      if (stopped) {
        return
      }
      stopped = true
      observer?.disconnect()
      for (const [layer, saved] of layers) {
        const style = styleOf(layer)
        if (style) {
          restore(style, saved)
        }
      }
      layers.clear()
      restoreAncestors()
    },
  }
}
