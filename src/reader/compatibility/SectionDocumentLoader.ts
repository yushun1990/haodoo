import {
  peekBrowserCapabilities,
  type BrowserCapabilities,
} from './BrowserCapabilities'

export type SectionDocumentTransport = 'url' | 'blob' | 'srcdoc' | 'document-write'

export interface SectionDocumentAttempt {
  transport: SectionDocumentTransport | 'html-source'
  outcome: 'success' | 'failed' | 'skipped'
  detail: string
}

export interface SectionDocumentLoadInput {
  iframe: HTMLIFrameElement
  source: string
  getHtml?: () => Promise<string>
  capabilities?: BrowserCapabilities
}

export interface SectionDocumentLoadResult {
  document: Document
  transport: SectionDocumentTransport
  attempts: SectionDocumentAttempt[]
}

export class SectionDocumentTransportError extends Error {
  readonly kind = 'transport'
  readonly attempts: SectionDocumentAttempt[]

  constructor(message: string, attempts: SectionDocumentAttempt[], options?: ErrorOptions) {
    super(message, options)
    this.name = 'SectionDocumentTransportError'
    this.attempts = attempts
  }
}

export interface SectionDocumentLoaderBridge {
  load(input: SectionDocumentLoadInput): Promise<SectionDocumentLoadResult>
  getLastResult(): SectionDocumentLoadResult | undefined
}

type SectionDocumentLoaderGlobal = typeof globalThis & {
  __HAODOO_SECTION_DOCUMENT_LOADER__?: SectionDocumentLoaderBridge
}

const UNKNOWN_BLOB_TIMEOUT_MS = 900
const KNOWN_BLOB_TIMEOUT_MS = 1_500
const URL_TIMEOUT_MS = 8_000
const FALLBACK_TIMEOUT_MS = 1_500
const POLL_INTERVAL_MS = 25

let lastResult: SectionDocumentLoadResult | undefined

function hasUsableContent(doc: Document | null | undefined): doc is Document {
  const body = doc?.body
  if (!body) return false
  if (body.textContent?.trim()) return true
  return Boolean(body.querySelector('img, svg, video, canvas, math, object'))
}

function errorText(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error)
}

async function waitForUsableDocument(
  iframe: HTMLIFrameElement,
  timeoutMs: number,
  label: string,
): Promise<Document> {
  const deadline = Date.now() + timeoutMs
  let lastUrl = ''

  while (Date.now() < deadline) {
    try {
      const doc = iframe.contentDocument
      lastUrl = doc?.URL ?? ''
      if (hasUsableContent(doc)) return doc
    } catch {
      // Keep polling until the explicit transport timeout.
    }
    await new Promise((resolve) => window.setTimeout(resolve, POLL_INTERVAL_MS))
  }

  throw new Error(
    `${label} did not produce usable iframe content within ${timeoutMs}ms (last URL: ${lastUrl || 'unavailable'})`,
  )
}

function loadUrl(
  iframe: HTMLIFrameElement,
  source: string,
  timeoutMs: number,
  label: string,
): Promise<Document> {
  return new Promise<Document>((resolve, reject) => {
    let settled = false

    const cleanup = () => {
      window.clearTimeout(timeoutId)
      iframe.removeEventListener('load', onLoad)
      iframe.removeEventListener('error', onError)
    }
    const finish = <T extends Document | Error>(callback: (value: T) => void, value: T) => {
      if (settled) return
      settled = true
      cleanup()
      callback(value)
    }
    const onLoad = () => {
      let doc: Document | null
      try {
        doc = iframe.contentDocument
      } catch (error) {
        finish(reject, error instanceof Error ? error : new Error(String(error)))
        return
      }

      const documentUrl = doc?.URL ?? ''
      // Embedded WebViews may deliver the iframe's delayed initial about:blank
      // load after navigation has already been assigned. Ignore it and let the
      // real navigation event or timeout decide the transport.
      if (source !== 'about:blank' && (!documentUrl || documentUrl === 'about:blank')) return

      if (!hasUsableContent(doc)) {
        finish(reject, new Error(`${label} loaded an empty document: ${documentUrl || 'unavailable'}`))
        return
      }
      finish(resolve, doc)
    }
    const onError = () => {
      finish(reject, new Error(`${label} emitted an iframe error event`))
    }
    const timeoutId = window.setTimeout(() => {
      let lastUrl = ''
      try {
        lastUrl = iframe.contentDocument?.URL ?? ''
      } catch {
        // The failure detail below is still useful without URL access.
      }
      finish(
        reject,
        new Error(
          `${label} did not produce usable iframe content within ${timeoutMs}ms (last URL: ${lastUrl || 'unavailable'})`,
        ),
      )
    }, timeoutMs)

    iframe.addEventListener('load', onLoad)
    iframe.addEventListener('error', onError)
    iframe.removeAttribute('srcdoc')
    iframe.src = source
  })
}

async function loadSrcdoc(iframe: HTMLIFrameElement, html: string): Promise<Document> {
  iframe.removeAttribute('src')
  iframe.srcdoc = html
  // srcdoc is reliable on target WebViews but its load event is not; inspect the
  // resulting document after a short navigation turn instead of depending on it.
  await new Promise((resolve) => window.setTimeout(resolve, 50))
  return waitForUsableDocument(iframe, FALLBACK_TIMEOUT_MS, 'srcdoc transport')
}

async function loadDocumentWrite(iframe: HTMLIFrameElement, html: string): Promise<Document> {
  iframe.removeAttribute('src')
  iframe.removeAttribute('srcdoc')

  const doc = iframe.contentDocument
  if (!doc) throw new Error('iframe contentDocument is unavailable for document.write')
  doc.open()
  doc.write(html)
  doc.close()

  return waitForUsableDocument(iframe, FALLBACK_TIMEOUT_MS, 'document.write transport')
}

async function resolveHtml(
  getHtml: SectionDocumentLoadInput['getHtml'],
  attempts: SectionDocumentAttempt[],
): Promise<string> {
  if (!getHtml) {
    const error = new Error('No rewritten section HTML provider is available for fallback transports')
    attempts.push({ transport: 'html-source', outcome: 'failed', detail: error.message })
    throw error
  }

  try {
    const html = await getHtml()
    if (!html.trim()) throw new Error('Rewritten section HTML is empty')
    attempts.push({ transport: 'html-source', outcome: 'success', detail: 'rewritten HTML available' })
    return html
  } catch (error) {
    attempts.push({ transport: 'html-source', outcome: 'failed', detail: errorText(error) })
    throw error
  }
}

export async function loadSectionDocument(
  input: SectionDocumentLoadInput,
): Promise<SectionDocumentLoadResult> {
  const { iframe, source } = input
  const attempts: SectionDocumentAttempt[] = []
  const capabilities = input.capabilities ?? peekBrowserCapabilities()
  const isBlob = source.startsWith('blob:')

  if (!isBlob) {
    try {
      const document = await loadUrl(iframe, source, URL_TIMEOUT_MS, 'section URL transport')
      const result = {
        document,
        transport: 'url' as const,
        attempts: [{ transport: 'url' as const, outcome: 'success' as const, detail: source }],
      }
      lastResult = result
      return result
    } catch (error) {
      attempts.push({ transport: 'url', outcome: 'failed', detail: errorText(error) })
      throw new SectionDocumentTransportError(
        `Section URL transport failed: ${errorText(error)}`,
        attempts,
        { cause: error },
      )
    }
  }

  if (capabilities?.blobIframe === false) {
    attempts.push({
      transport: 'blob',
      outcome: 'skipped',
      detail: 'BrowserCapabilities.blobIframe=false',
    })
  } else {
    try {
      const document = await loadUrl(
        iframe,
        source,
        capabilities ? KNOWN_BLOB_TIMEOUT_MS : UNKNOWN_BLOB_TIMEOUT_MS,
        'blob iframe transport',
      )
      const result = {
        document,
        transport: 'blob' as const,
        attempts: [
          ...attempts,
          { transport: 'blob' as const, outcome: 'success' as const, detail: source },
        ],
      }
      lastResult = result
      return result
    } catch (error) {
      attempts.push({ transport: 'blob', outcome: 'failed', detail: errorText(error) })
    }
  }

  let html: string
  try {
    html = await resolveHtml(input.getHtml, attempts)
  } catch (error) {
    throw new SectionDocumentTransportError(
      `Section fallback HTML is unavailable: ${errorText(error)}`,
      attempts,
      { cause: error },
    )
  }

  if (capabilities?.srcdocIframe === false) {
    attempts.push({
      transport: 'srcdoc',
      outcome: 'skipped',
      detail: 'BrowserCapabilities.srcdocIframe=false',
    })
  } else {
    try {
      const document = await loadSrcdoc(iframe, html)
      const result = {
        document,
        transport: 'srcdoc' as const,
        attempts: [
          ...attempts,
          {
            transport: 'srcdoc' as const,
            outcome: 'success' as const,
            detail: 'rewritten HTML injected',
          },
        ],
      }
      lastResult = result
      return result
    } catch (error) {
      attempts.push({ transport: 'srcdoc', outcome: 'failed', detail: errorText(error) })
    }
  }

  if (capabilities?.documentWriteIframe === false) {
    attempts.push({
      transport: 'document-write',
      outcome: 'skipped',
      detail: 'BrowserCapabilities.documentWriteIframe=false',
    })
  } else {
    try {
      const document = await loadDocumentWrite(iframe, html)
      const result = {
        document,
        transport: 'document-write' as const,
        attempts: [
          ...attempts,
          {
            transport: 'document-write' as const,
            outcome: 'success' as const,
            detail: 'rewritten HTML injected',
          },
        ],
      }
      lastResult = result
      return result
    } catch (error) {
      attempts.push({ transport: 'document-write', outcome: 'failed', detail: errorText(error) })
    }
  }

  throw new SectionDocumentTransportError(
    `No usable section iframe transport remains (${attempts.map((attempt) => `${attempt.transport}:${attempt.outcome}`).join(', ')})`,
    attempts,
  )
}

export function installSectionDocumentLoader(): SectionDocumentLoaderBridge {
  const runtime = globalThis as SectionDocumentLoaderGlobal
  if (runtime.__HAODOO_SECTION_DOCUMENT_LOADER__) {
    return runtime.__HAODOO_SECTION_DOCUMENT_LOADER__
  }

  const bridge: SectionDocumentLoaderBridge = {
    load: loadSectionDocument,
    getLastResult: () => lastResult,
  }
  runtime.__HAODOO_SECTION_DOCUMENT_LOADER__ = bridge
  return bridge
}
