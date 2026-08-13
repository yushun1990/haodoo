import { useEffect, useMemo, useState } from 'react'

type ProbeStatus = 'running' | 'pass' | 'fail'

type ProbeResult = {
  name: string
  status: ProbeStatus
  detail: string
}

const timeout = <T,>(promise: Promise<T>, ms: number, label: string): Promise<T> =>
  Promise.race([
    promise,
    new Promise<T>((_, reject) => window.setTimeout(() => reject(new Error(`${label} timeout`)), ms)),
  ])

function errorText(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error)
}

async function probeIframe(
  mode: 'blob' | 'srcdoc' | 'write',
): Promise<string> {
  const iframe = document.createElement('iframe')
  iframe.setAttribute('sandbox', 'allow-same-origin allow-scripts')
  iframe.style.position = 'fixed'
  iframe.style.left = '-10000px'
  iframe.style.top = '0'
  iframe.style.width = '320px'
  iframe.style.height = '240px'
  document.body.append(iframe)

  const html = `<!doctype html><html><head><style>html{column-width:140px;column-gap:20px;height:200px}body{margin:0;font-size:18px;line-height:1.6}</style></head><body><p id="probe">WebView iframe probe. 甲乙丙丁戊己庚辛壬癸。This text should produce measurable geometry across columns.</p><script>document.body.dataset.script='ok'<\/script></body></html>`
  let blobUrl = ''

  try {
    if (mode === 'blob') {
      blobUrl = URL.createObjectURL(new Blob([html], { type: 'text/html' }))
      await timeout(
        new Promise<void>((resolve, reject) => {
          iframe.addEventListener('load', () => resolve(), { once: true })
          iframe.addEventListener('error', () => reject(new Error('iframe error event')), { once: true })
          iframe.src = blobUrl
        }),
        4000,
        'blob iframe load',
      )
    } else if (mode === 'srcdoc') {
      await timeout(
        new Promise<void>((resolve) => {
          iframe.addEventListener('load', () => resolve(), { once: true })
          iframe.srcdoc = html
        }),
        4000,
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

async function runProbe(name: string, probe: () => Promise<string> | string): Promise<ProbeResult> {
  try {
    const detail = await probe()
    return { name, status: 'pass', detail }
  } catch (error) {
    return { name, status: 'fail', detail: errorText(error) }
  }
}

async function runAllProbes(): Promise<ProbeResult[]> {
  const results: ProbeResult[] = []
  const add = async (name: string, probe: () => Promise<string> | string) => {
    results.push(await runProbe(name, probe))
  }

  await add('JS compatibility', () => {
    const features = {
      arrayAt: typeof Array.prototype.at,
      findLast: typeof Array.prototype.findLast,
      objectFromEntries: typeof Object.fromEntries,
      objectGroupBy: typeof (Object as typeof Object & { groupBy?: unknown }).groupBy,
      mapGroupBy: typeof (Map as typeof Map & { groupBy?: unknown }).groupBy,
      replaceAll: typeof String.prototype.replaceAll,
    }
    const missing = Object.entries(features).filter(([, value]) => value !== 'function')
    if (missing.length) throw new Error(`missing: ${missing.map(([key]) => key).join(', ')}`)
    return Object.entries(features)
      .map(([key, value]) => `${key}=${value}`)
      .join(', ')
  })

  await add('Blob URL + fetch(blob:)', async () => {
    const url = URL.createObjectURL(new Blob(['haodoo-blob-ok'], { type: 'text/plain' }))
    try {
      const response = await timeout(fetch(url), 4000, 'fetch(blob:)')
      const text = await response.text()
      if (text !== 'haodoo-blob-ok') throw new Error(`unexpected blob text: ${text}`)
      return `status=${response.status}, text=${text}`
    } finally {
      URL.revokeObjectURL(url)
    }
  })

  await add('Sandbox iframe: blob URL', () => probeIframe('blob'))
  await add('Sandbox iframe: srcdoc', () => probeIframe('srcdoc'))
  await add('Sandbox iframe: document.write', () => probeIframe('write'))

  await add('ResizeObserver', async () => {
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

  await add('CSS columns + Range geometry', () => {
    const host = document.createElement('div')
    host.style.position = 'fixed'
    host.style.left = '-10000px'
    host.style.width = '320px'
    host.style.height = '200px'
    host.style.columnWidth = '140px'
    host.style.columnGap = '20px'
    host.style.columnFill = 'auto'
    host.textContent = '甲乙丙丁戊己庚辛壬癸 '.repeat(80)
    document.body.append(host)
    try {
      const range = document.createRange()
      range.selectNodeContents(host)
      const rect = range.getBoundingClientRect()
      if (!(rect.width > 0 && rect.height > 0)) throw new Error(`zero geometry: ${rect.width}x${rect.height}`)
      return `range=${Math.round(rect.width)}x${Math.round(rect.height)}, scroll=${host.scrollWidth}x${host.scrollHeight}`
    } finally {
      host.remove()
    }
  })

  return results
}

async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
    return
  } catch {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.style.position = 'fixed'
    textarea.style.left = '-10000px'
    document.body.append(textarea)
    textarea.select()
    document.execCommand('copy')
    textarea.remove()
  }
}

export function WebViewDiagnostics() {
  const [results, setResults] = useState<ProbeResult[]>([])
  const [running, setRunning] = useState(true)
  const [copied, setCopied] = useState(false)

  const environment = useMemo(
    () => ({
      version: 'webview-diag-1',
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      language: navigator.language,
      viewport: `${window.innerWidth}x${window.innerHeight}@${window.devicePixelRatio}`,
      standalone: window.matchMedia('(display-mode: standalone)').matches ? 'yes' : 'no',
      serviceWorker: 'serviceWorker' in navigator ? 'yes' : 'no',
    }),
    [],
  )

  const run = async () => {
    setRunning(true)
    setCopied(false)
    setResults(await runAllProbes())
    setRunning(false)
  }

  useEffect(() => {
    void run()
  }, [])

  const report = [
    ...Object.entries(environment).map(([key, value]) => `${key}: ${value}`),
    '',
    ...results.map((result) => `${result.status.toUpperCase()} | ${result.name} | ${result.detail}`),
  ].join('\n')

  return (
    <main className="page status-page" style={{ alignItems: 'stretch', textAlign: 'left', maxWidth: 760 }}>
      <a className="back-link" href="#">← 返回书目</a>
      <h1>WebView 兼容诊断</h1>
      <p>这个页面只测试 Foliate 依赖的底层浏览器能力，不会打开书籍。</p>

      <section style={{ display: 'grid', gap: 8, margin: '16px 0' }}>
        {Object.entries(environment).map(([key, value]) => (
          <div key={key} style={{ overflowWrap: 'anywhere' }}>
            <strong>{key}</strong>：{value}
          </div>
        ))}
      </section>

      <section style={{ display: 'grid', gap: 10 }} aria-live="polite">
        {running && results.length === 0 && <p>正在运行诊断…</p>}
        {results.map((result) => (
          <article
            key={result.name}
            style={{
              border: '1px solid rgba(42, 65, 52, 0.2)',
              borderRadius: 12,
              padding: 12,
              overflowWrap: 'anywhere',
            }}
          >
            <strong>{result.status === 'pass' ? '✅' : '❌'} {result.name}</strong>
            <div style={{ marginTop: 6, opacity: 0.78 }}>{result.detail}</div>
          </article>
        ))}
      </section>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 20 }}>
        <button className="load-more" type="button" onClick={() => void run()} disabled={running}>
          {running ? '诊断中…' : '重新诊断'}
        </button>
        <button
          className="load-more"
          type="button"
          disabled={running || results.length === 0}
          onClick={() => {
            void copyText(report).then(() => setCopied(true))
          }}
        >
          {copied ? '已复制' : '复制诊断结果'}
        </button>
      </div>
    </main>
  )
}
