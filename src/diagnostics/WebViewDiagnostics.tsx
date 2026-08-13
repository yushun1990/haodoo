import { useEffect, useMemo, useState } from 'react'
import {
  getBrowserCapabilityReport,
  type BrowserCapabilities,
  type BrowserCapabilityProbeResult,
} from '../reader/compatibility/BrowserCapabilities'

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
  const [results, setResults] = useState<BrowserCapabilityProbeResult[]>([])
  const [capabilities, setCapabilities] = useState<BrowserCapabilities>()
  const [running, setRunning] = useState(true)
  const [copied, setCopied] = useState(false)

  const environment = useMemo(
    () => ({
      version: 'webview-diag-2',
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      language: navigator.language,
      viewport: `${window.innerWidth}x${window.innerHeight}@${window.devicePixelRatio}`,
      standalone: window.matchMedia('(display-mode: standalone)').matches ? 'yes' : 'no',
      serviceWorker: 'serviceWorker' in navigator ? 'yes' : 'no',
    }),
    [],
  )

  const run = async (refresh = false) => {
    setRunning(true)
    setCopied(false)
    try {
      const report = await getBrowserCapabilityReport({ refresh })
      setCapabilities(report.capabilities)
      setResults(report.probes)
    } catch (error: unknown) {
      const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
      setCapabilities(undefined)
      setResults([
        {
          key: 'javascriptRuntime',
          name: 'Capability probe runner',
          supported: false,
          detail,
        },
      ])
    } finally {
      setRunning(false)
    }
  }

  useEffect(() => {
    void run()
  }, [])

  const capabilityLines = capabilities
    ? Object.entries(capabilities).map(([key, value]) => `${key}: ${value ? 'PASS' : 'FAIL'}`)
    : []
  const report = [
    ...Object.entries(environment).map(([key, value]) => `${key}: ${value}`),
    '',
    ...capabilityLines,
    '',
    ...results.map((result) => `${result.supported ? 'PASS' : 'FAIL'} | ${result.name} | ${result.detail}`),
  ].join('\n')

  return (
    <main className="page status-page" style={{ alignItems: 'stretch', textAlign: 'left', maxWidth: 760 }}>
      <a className="back-link" href="#">← 返回书目</a>
      <h1>WebView 兼容诊断</h1>
      <p>这里展示的 capability probes 与 Reader 共用同一实现；检测基于运行时能力，不按浏览器品牌分支。</p>

      <section style={{ display: 'grid', gap: 8, margin: '16px 0' }}>
        {Object.entries(environment).map(([key, value]) => (
          <div key={key} style={{ overflowWrap: 'anywhere' }}>
            <strong>{key}</strong>：{value}
          </div>
        ))}
      </section>

      {capabilities && (
        <section style={{ display: 'grid', gap: 8, margin: '0 0 18px' }} aria-label="Reader capability summary">
          {Object.entries(capabilities).map(([key, value]) => (
            <div key={key} style={{ overflowWrap: 'anywhere' }}>
              <strong>{value ? '✅' : '❌'} {key}</strong>
            </div>
          ))}
        </section>
      )}

      <section style={{ display: 'grid', gap: 10 }} aria-live="polite">
        {running && results.length === 0 && <p>正在运行诊断…</p>}
        {results.map((result) => (
          <article
            key={result.key}
            style={{
              border: '1px solid rgba(42, 65, 52, 0.2)',
              borderRadius: 12,
              padding: 12,
              overflowWrap: 'anywhere',
            }}
          >
            <strong>{result.supported ? '✅' : '❌'} {result.name}</strong>
            <div style={{ marginTop: 6, opacity: 0.78 }}>{result.detail}</div>
          </article>
        ))}
      </section>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 20 }}>
        <button className="load-more" type="button" onClick={() => void run(true)} disabled={running}>
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
