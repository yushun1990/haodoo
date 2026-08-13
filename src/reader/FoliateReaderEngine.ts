import type {
  ReaderEngine,
  ReaderLocation,
  ReaderOpenOptions,
  ReaderPreferences,
  ReaderSource,
  ReaderTocItem,
} from './ReaderEngine'

interface FoliateTocItem {
  label?: string
  href?: string
  subitems?: FoliateTocItem[]
}

interface FoliateBook {
  toc?: FoliateTocItem[]
}

interface FoliateRenderer extends HTMLElement {
  getContents?: () => Array<{ doc?: Document }>
}

interface FoliateViewElement extends HTMLElement {
  book?: FoliateBook
  renderer?: FoliateRenderer
  open: (source: string) => Promise<void>
  init: (options: { lastLocation?: string; showTextStart?: boolean }) => Promise<void>
  next: () => Promise<void>
  prev: () => Promise<void>
  goTo: (target: string) => Promise<unknown>
  close: () => void
}

interface FoliateRelocateDetail {
  cfi?: string
  fraction?: number
  tocItem?: { label?: string }
}

interface FoliateLoadDetail {
  doc?: Document
}

function ensureFoliateBrowserCompatibility(): void {
  const arrayPrototype = Array.prototype as typeof Array.prototype & {
    at?: (index: number) => unknown
  }

  if (typeof arrayPrototype.at !== 'function') {
    Object.defineProperty(Array.prototype, 'at', {
      value(this: unknown[], index: number) {
        const length = Number(this.length) || 0
        let relativeIndex = Math.trunc(Number(index) || 0)
        if (relativeIndex < 0) relativeIndex += length
        if (relativeIndex < 0 || relativeIndex >= length) return undefined
        return this[relativeIndex]
      },
      writable: true,
      configurable: true,
    })
  }

  const objectConstructor = Object as typeof Object & {
    groupBy?: <T, K extends PropertyKey>(
      items: Iterable<T>,
      callback: (item: T, index: number) => K,
    ) => Partial<Record<K, T[]>>
  }

  if (typeof objectConstructor.groupBy !== 'function') {
    Object.defineProperty(Object, 'groupBy', {
      value<T, K extends PropertyKey>(
        items: Iterable<T>,
        callback: (item: T, index: number) => K,
      ): Partial<Record<K, T[]>> {
        if (items == null) throw new TypeError('Object.groupBy requires an iterable')
        if (typeof callback !== 'function') throw new TypeError('Object.groupBy callback must be a function')

        const groups = Object.create(null) as Partial<Record<K, T[]>>
        let index = 0
        for (const item of items) {
          const key = callback(item, index++)
          const current = groups[key]
          if (current) current.push(item)
          else groups[key] = [item]
        }
        return groups
      },
      writable: true,
      configurable: true,
    })
  }

  const mapConstructor = Map as typeof Map & {
    groupBy?: <T, K>(
      items: Iterable<T>,
      callback: (item: T, index: number) => K,
    ) => Map<K, T[]>
  }

  if (typeof mapConstructor.groupBy !== 'function') {
    Object.defineProperty(Map, 'groupBy', {
      value<T, K>(items: Iterable<T>, callback: (item: T, index: number) => K): Map<K, T[]> {
        if (items == null) throw new TypeError('Map.groupBy requires an iterable')
        if (typeof callback !== 'function') throw new TypeError('Map.groupBy callback must be a function')

        const groups = new Map<K, T[]>()
        let index = 0
        for (const item of items) {
          const key = callback(item, index++)
          const current = groups.get(key)
          if (current) current.push(item)
          else groups.set(key, [item])
        }
        return groups
      },
      writable: true,
      configurable: true,
    })
  }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timeoutId: number | undefined
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error(message)), timeoutMs)
  })

  try {
    return await Promise.race([promise, timeout])
  } finally {
    if (timeoutId !== undefined) window.clearTimeout(timeoutId)
  }
}

function normalizeToc(items: FoliateTocItem[] | undefined): ReaderTocItem[] {
  if (!items) return []

  return items.flatMap((item) => {
    if (!item.href || !item.label) return []
    return [
      {
        label: item.label.trim(),
        href: item.href,
        children: normalizeToc(item.subitems),
      },
    ]
  })
}

export class FoliateReaderEngine implements ReaderEngine {
  #view?: FoliateViewElement
  #container?: HTMLElement
  #source?: ReaderSource
  #toc: ReaderTocItem[] = []
  #listeners = new Set<(location: ReaderLocation) => void>()
  #preferences?: ReaderPreferences
  #lastLocation?: ReaderLocation

  async open(
    container: HTMLElement,
    source: ReaderSource,
    options: ReaderOpenOptions,
  ): Promise<void> {
    this.close()
    this.#container = container
    this.#source = source
    this.#preferences = options.preferences
    this.#lastLocation = options.location

    ensureFoliateBrowserCompatibility()
    await import('foliate-js/view.js')

    const view = document.createElement('foliate-view') as FoliateViewElement
    view.className = 'reader-engine-view'
    view.addEventListener('load', this.#handleLoad as EventListener)
    view.addEventListener('relocate', this.#handleRelocate as EventListener)
    container.replaceChildren(view)
    this.#view = view

    await withTimeout(
      view.open(source.url),
      30_000,
      'EPUB 下载或解析超过 30 秒。请检查当前浏览器对阅读引擎的兼容性或网络连接。',
    )
    this.#toc = normalizeToc(view.book?.toc)
    this.#applyPreferences()
    await withTimeout(
      view.init({
        lastLocation: options.location?.cfi,
        showTextStart: !options.location,
      }),
      15_000,
      'EPUB 已载入，但分页初始化超过 15 秒。当前移动浏览器可能与 Foliate 阅读引擎不兼容。',
    )
  }

  close(): void {
    if (this.#view) {
      this.#view.removeEventListener('load', this.#handleLoad as EventListener)
      this.#view.removeEventListener('relocate', this.#handleRelocate as EventListener)
      this.#view.close()
      this.#view.remove()
    }
    this.#container?.replaceChildren()
    this.#view = undefined
    this.#container = undefined
    this.#source = undefined
    this.#lastLocation = undefined
    this.#toc = []
  }

  async next(): Promise<void> {
    await this.#view?.next()
  }

  async prev(): Promise<void> {
    await this.#view?.prev()
  }

  async goTo(target: string): Promise<void> {
    await this.#view?.goTo(target)
  }

  getToc(): ReaderTocItem[] {
    return this.#toc
  }

  async setPreferences(preferences: ReaderPreferences): Promise<void> {
    const previousWritingMode = this.#preferences?.writingMode
    const container = this.#container
    const source = this.#source
    const location = this.#lastLocation
    const shouldReopen =
      previousWritingMode !== undefined &&
      previousWritingMode !== preferences.writingMode &&
      Boolean(this.#view && container && source)

    this.#preferences = preferences

    if (shouldReopen && container && source) {
      await this.open(container, source, { location, preferences })
      return
    }

    this.#applyPreferences()
  }

  onLocationChange(listener: (location: ReaderLocation) => void): () => void {
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }

  #handleLoad = (event: CustomEvent<FoliateLoadDetail>): void => {
    if (event.detail.doc) this.#applyDocumentPreferences(event.detail.doc)
  }

  #handleRelocate = (event: CustomEvent<FoliateRelocateDetail>): void => {
    const { cfi, fraction, tocItem } = event.detail
    if (!cfi) return

    const location: ReaderLocation = {
      cfi,
      fraction: typeof fraction === 'number' ? fraction : undefined,
      chapter: tocItem?.label?.trim() || undefined,
    }
    this.#lastLocation = location
    for (const listener of this.#listeners) listener(location)
  }

  #applyPreferences(): void {
    const view = this.#view
    const preferences = this.#preferences
    if (!view || !preferences) return

    const renderer = view.renderer
    renderer?.setAttribute('flow', 'paginated')
    renderer?.setAttribute('gap', `${preferences.pageGap}%`)
    renderer?.setAttribute('margin', `${preferences.chromeMargin}px`)
    renderer?.setAttribute('max-column-count', '1')

    for (const content of renderer?.getContents?.() ?? []) {
      if (content.doc) this.#applyDocumentPreferences(content.doc)
    }
  }

  #applyDocumentPreferences(doc: Document): void {
    const preferences = this.#preferences
    if (!preferences || !doc.head) return

    let style = doc.querySelector<HTMLStyleElement>('style[data-haodoo-reader]')
    if (!style) {
      style = doc.createElement('style')
      style.dataset.haodooReader = 'true'
      doc.head.append(style)
    }

    const writingMode =
      preferences.writingMode === 'vertical'
        ? 'writing-mode: vertical-rl !important; text-orientation: mixed !important;'
        : preferences.writingMode === 'horizontal'
          ? 'writing-mode: horizontal-tb !important; text-orientation: mixed !important;'
          : ''

    style.textContent = `
      html, body {
        text-rendering: optimizeLegibility;
        line-break: strict !important;
        word-break: normal !important;
      }
      body {
        font-size: ${preferences.fontScale}% !important;
        line-height: ${preferences.lineHeight} !important;
        letter-spacing: ${preferences.letterSpacing}em !important;
        ${writingMode}
      }
      img, svg, video {
        max-width: 100% !important;
        height: auto;
      }
    `
  }
}
