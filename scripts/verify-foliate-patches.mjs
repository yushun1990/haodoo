import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { assertPinnedFoliateVersion } from './foliate-patch-policy.mjs'

await assertPinnedFoliateVersion()

const paginator = await readFile(resolve('node_modules/foliate-js/paginator.js'), 'utf8')
const epub = await readFile(resolve('node_modules/foliate-js/epub.js'), 'utf8')

const requireMarker = (source, marker, label) => {
  if (!source.includes(marker)) {
    throw new Error(`Foliate patch verification failed: missing ${label}`)
  }
}

const forbidMarker = (source, marker, label) => {
  if (source.includes(marker)) {
    throw new Error(`Foliate patch verification failed: obsolete ${label} is still present`)
  }
}

// Category A — upstream hardening.
requireMarker(paginator, 'if (!this.#view?.document?.body) return', 'Paginator.render detached-document guard')
requireMarker(paginator, 'if (!document?.documentElement) return', 'View.expand detached-document guard')
requireMarker(paginator, 'console.warn(new Error(`Failed to load section ${index}`))\n                    throw e', 'section-load error propagation')
requireMarker(paginator, 'try {\n            const prev = dir === -1', 'navigation lock try/finally guard')
requireMarker(paginator, '} finally {\n            this.#locked = false', 'navigation lock release')

// Category C — Haodoo WebView adaptation.
requireMarker(paginator, 'globalThis.__HAODOO_SECTION_DOCUMENT_LOADER__', 'SectionDocumentLoader bridge')
requireMarker(paginator, 'globalThis.__HAODOO_BLOB_TEXT_REGISTRY__', 'BlobTextRegistry fallback provider')
requireMarker(paginator, "wrapped.name = kind === 'pagination'", 'transport/render/pagination failure staging')

requireMarker(epub, 'getHaodooBlobTextRegistry().register(url, newData)', 'BlobTextRegistry register hook')
requireMarker(epub, 'getHaodooBlobTextRegistry().delete(url)', 'BlobTextRegistry delete hook')
requireMarker(epub, 'URL.revokeObjectURL(url)', 'Foliate blob revoke lifecycle')

// Category B — generic runtime compatibility must not rewrite Foliate source.
requireMarker(epub, 'Object.groupBy(', 'native Object.groupBy call')
requireMarker(epub, 'Map.groupBy(', 'native Map.groupBy call')
forbidMarker(epub, 'haodooObjectGroupBy', 'embedded Object.groupBy helper')
forbidMarker(epub, 'haodooMapGroupBy', 'embedded Map.groupBy helper')
forbidMarker(epub, '__HAODOO_FOLIATE_BLOB_TEXT__', 'legacy blob-text Map')

console.log('Foliate patch contract verified for pinned foliate-js@1.0.1')
