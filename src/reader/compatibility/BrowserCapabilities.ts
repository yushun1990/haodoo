export interface BrowserCapabilities {
  blobFetch: boolean
  blobIframe: boolean
  srcdocIframe: boolean
  documentWriteIframe: boolean
  cssColumns: boolean
  rangeGeometry: boolean
  resizeObserver: boolean
  documentFonts: boolean
}

export type BrowserCapabilityKey = keyof BrowserCapabilities

export interface BrowserCapabilityProbeResult {
  key: BrowserCapabilityKey | 'javascriptRuntime'
  name: string
  supported: boolean
  detail: string
}

export interface BrowserCapabilityReport {
  capabilities: BrowserCapabilities
  probes: BrowserCapabilityProbeResult[]
}

interface BrowserCapabilityOptions {
  refresh?: boolean
}

type IframeMode = 'blob' | 'srcdoc' | 'write'

type IdleWindow = Window & {
  requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number
}

const PROBE_TIMEOUT_MS = 4_000

let cachedReport: Promise<BrowserCapabilityReport> | undefined
let resolvedCapabilities: BrowserCapabilities | undefined
let warmScheduled = false

function errorText(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error)
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => reject(new Error(`${label} timeout`)), ms)
    promise.then(
      (value) => {
        window.clearTimeout(timeoutId)
        resolve(value)
      },
      (error: unknown) => {
        window.clearTimeout(timeoutId)
        reject(error)
      },
    )
  })
}

async function probeIframe(mode: IframeMode): Promise<string> {
  const iframe = document.createElement('iframe')
  iframe.setAttribute('sandbox', 'allow-same-origin allow-scripts')
  iframe.style.position = 'fixed'
  iframe.style.left = '-10000px'
  iframe.style.top = '0'
  iframe.style.width = '320px'
  iframe.style.height = '240px'
  document.body.append(iframe)

  const html = '<!doctype html><html><head><style>html{column-width:140px;column-gap:20px;height:200px}body{margin:0;font-size:18px;line-height:1.6}</style></head><body><p id="probe">WebView iframe probe. 甲乙丙丁戊己庚辛壬癸。This text should produce measurable geometry across columns.</p><script>document.body.dataset.script="ok"</script></body></html>'
  let blobUrl = ''

  try {
    if (mode === 'blob') {
      blobUrl = URL.createObjectURL(new Blob([html], { type: 'text/html' }))
      await withTimeout(
        new Promise<void>((resolve, reject) => {
          iframe.addEventListener('load', () => resolve(), { once: true })
          iframe.addEventListener('error', () => reject(new Error('iframe error event')), { once: true })
          iframe.src = blobUrl
        }),
        PROBE_TIMEOUT_MS,
        'blob iframe load',
      )
    } else if (mode === 'srcdoc') {
      await withTimeout(
        new Promise<void>((resolve) => {
          iframe.addEventListener('load', () => resolve(), { once: true })
          iframe.srcdoc = html
        }),
        PROBE_TIMEOUT_MS,
        'srcdoc iframe load',
      )
    } else {
      const doc = iframe.contentDocument
      if (!doc) throw new Error('contentDocument unavailable before document.write')
      doc.open()
      doc.write(html)
      doc.close()
      await new Promise((resolve) => window.setTimeout(resolve, 100))
    }

    const doc = iframe.contentDocument
    if (!doc?.body) throw new Error('iframe contentDocument/body unavailable')
    const text = doc.body.textContent?.trim() ?? ''
    if (!text.includes('WebView iframe probe')) throw new Error(`body is blank: url=${doc.URL}`)

    const paragraph = doc.getElementById('probe')
    if (!paragraph) throw new Error('probe paragraph missing')
    const range = doc.createRange()
    range.selectNodeContents(paragraph)
    const rangeRect = range.getBoundingClientRect()
    const elementRect = paragraph.getBoundingClientRect()
    const computed = doc.defaultView?.getComputedStyle(doc.documentElement)

    return [
      `url=${doc.URL}`,
      `script=${doc.body.dataset.script ?? 'missing'}`,
      `range=${Math.round(rangeRect.width)}x${Math.round(rangeRect.height)}`,
      `element=${Math.round(elementRect.width)}x${Math.round(elementRect.height)}`,
      `columns=${computed?.columnWidth ?? 'unknown'}`,
      `fonts=${doc.fonts ? 'yes' : 'no'}`,
    ].join(', ')
  } finally {
    if (blobUrl) URL.revokeObjectURL(blobUrl)
    iframe.remove()
  }
}

async function runBrowserCapabilityProbes(): Promise<BrowserCapabilityReport> {
  const capabilities: BrowserCapabilities = {
    blobFetch: false,
    blobIframe: false,
    srcdocIframe: false,
    documentWriteIframe: false,
    cssColumns: false,
    rangeGeometry: false,
    resizeObserver: false,
    documentFonts: false,
  }
  const probes: BrowserCapabilityProbeResult[] = []

  const addCapability = async (
    key: BrowserCapabilityKey,
    name: string,
    probe: () => Promise<string> | string,
  ) => {
    try {
      const detail = await probe()
      capabilities[key] = true
      probes.push({ key, name, supported: true, detail })
    } catch (error) {
      capabilities[key] = false
      probes.push({ key, name, supported: false, detail: errorText(error) })
    }
  }

  try {
    const features = {
      arrayAt: typeof Array.prototype.at,
      findLast: typeof (Array.prototype as typeof Array.prototype & { findLast?: unknown }).findLast,
      objectFromEntries: typeof Object.fromEntries,
      objectGroupBy: typeof (Object as typeof Object & { groupBy?: unknown }).groupBy,
      mapGroupBy: typeof (Map as typeof Map & { groupBy?: unknown }).groupBy,
      replaceAll: typeof String.prototype.replaceAll,
    }
    const missing = Object.entries(features).filter(([, value]) => value !== 'function')
    if (missing.length) throw new Error(`missing: ${missing.map(([key]) => key).join(', ')}`)
    probes.push({
      key: 'javascriptRuntime',
      name: 'JS compatibility',
      supported: true,
      detail: Object.entries(features)
        .map(([key, value]) => `${key}=${value}`)
        .join(', '),
    })
  } catch (error) {
    probes.push({
      key: 'javascriptRuntime',
      name: 'JS compatibility',
      supported: false,
      detail: errorText(error),
    })
  }

  await addCapability('blobFetch', 'Blob URL + fetch(blob:)', async () => {
    const url = URL.createObjectURL(new Blob(['haodoo-blob-ok'], { type: 'text/plain' }))
    try {
      const response = await withTimeout(fetch(url), PROBE_TIMEOUT_MS, 'fetch(blob:)')
      const text = await response.text()
      if (text !== 'haodoo-blob-ok') throw new Error(`unexpected blob text: ${text}`)
      return `status=${response.status}, text=${text}`
    } finally {
      URL.revokeObjectURL(url)
    }
  })

  await addCapability('blobIframe', 'Sandbox iframe: blob URL', () => probeIframe('blob'))
  await addCapability('srcdocIframe', 'Sandbox iframe: srcdoc', () => probeIframe('srcdoc'))
  await addCapability('documentWriteIframe', 'Sandbox iframe: document.write', () => probeIframe('write'))

  await addCapability('resizeObserver', 'ResizeObserver', async () => {
    if (typeof ResizeObserver !== 'function') throw new Error('ResizeObserver missing')
    const element = document.createElement('div')
    element.style.position = 'fixed'
    element.style.left = '-10000px'
    element.style.width = '10px'
    element.style.height = '10px'
    document.body.append(element)
    try {
      let calls = 0
      const observer = new ResizeObserver(() => {
        calls += 1
      })
      observer.observe(element)
      element.style.width = '30px'
      await new Promise((resolve) => window.setTimeout(resolve, 250))
      observer.disconnect()
      if (!calls) throw new Error('observer callback never fired')
      return `callbacks=${calls}`
    } finally {
      element.remove()
    }
  })

  const geometryHost = document.createElement('div')
  geometryHost.style.position = 'fixed'
  geometryHost.style.left = '-10000px'
  geometryHost.style.width = '320px'
  geometryHost.style.height = '200px'
  geometryHost.style.columnWidth = '140px'
  geometryHost.style.columnGap = '20px'
  geometryHost.style.columnFill = 'auto'
  geometryHost.textContent = '甲乙丙丁戊己庚辛壬癸 '.repeat(80)
  document.body.append(geometryHost)
  try {
    await addCapability('cssColumns', 'CSS columns', () => {
      const computed = window.getComputedStyle(geometryHost)
      if (computed.columnWidth === 'auto') throw new Error('column-width remained auto')
      if (geometryHost.scrollWidth <= geometryHost.clientWidth) {
        throw new Error(`columns did not overflow: ${geometryHost.scrollWidth}<=${geometryHost.clientWidth}`)
      }
      return `columnWidth=${computed.columnWidth}, scroll=${geometryHost.scrollWidth}x${geometryHost.scrollHeight}`
    })

    await addCapability('rangeGeometry', 'Range geometry', () => {
      const range = document.createRange()
      range.selectNodeContents(geometryHost)
      const rect = range.getBoundingClientRect()
      if (!(rect.width > 0 && rect.height > 0)) {
        throw new Error(`zero geometry: ${rect.width}x${rect.height}`)
      }
      return `range=${Math.round(rect.width)}x${Math.round(rect.height)}`
    })
  } finally {
    geometryHost.remove()
  }

  await addCapability('documentFonts', 'document.fonts', async () => {
    if (!document.fonts) throw new Error('document.fonts missing')
    await withTimeout(document.fonts.ready, PROBE_TIMEOUT_MS, 'document.fonts.ready')
    return `status=${document.fonts.status}`
  })

  return { capabilities, probes }
}

export function getBrowserCapabilityReport(
  options: BrowserCapabilityOptions = {},
): Promise<BrowserCapabilityReport> {
  if (!options.refresh && cachedReport) return cachedReport

  const report = runBrowserCapabilityProbes()
  cachedReport = report
  report.then(
    (result) => {
      if (cachedReport === report) resolvedCapabilities = result.capabilities
    },
    () => {
      if (cachedReport === report) {
        cachedReport = undefined
        resolvedCapabilities = undefined
      }
    },
  )
  return report
}

export async function getBrowserCapabilities(
  options: BrowserCapabilityOptions = {},
): Promise<BrowserCapabilities> {
  return (await getBrowserCapabilityReport(options)).capabilities
}

export function peekBrowserCapabilities(): BrowserCapabilities | undefined {
  return resolvedCapabilities
}

export function warmBrowserCapabilities(): void {
  if (cachedReport || warmScheduled) return
  warmScheduled = true

  const run = () => {
    warmScheduled = false
    void getBrowserCapabilityReport().catch(() => undefined)
  }
  const idleWindow = window as IdleWindow
  if (typeof idleWindow.requestIdleCallback === 'function') {
    idleWindow.requestIdleCallback(run, { timeout: 1_500 })
  } else {
    window.setTimeout(run, 250)
  }
}
