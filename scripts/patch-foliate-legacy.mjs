import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const target = resolve('node_modules/foliate-js/epub.js')
let source = await readFile(target, 'utf8')
const applied = []

const groupByMarker = 'const haodooObjectGroupBy = (items, callback) => {'

if (!source.includes(groupByMarker)) {
  if (!source.includes('Object.groupBy(') || !source.includes('Map.groupBy(')) {
    throw new Error(
      'foliate-js epub.js no longer contains the expected Object.groupBy/Map.groupBy calls. Review the legacy WebView patch before upgrading foliate-js.',
    )
  }

  const helpers = `const haodooObjectGroupBy = (items, callback) => {
    const groups = Object.create(null)
    let index = 0
    for (const item of items) {
        const key = callback(item, index++)
        const current = groups[key]
        if (current) current.push(item)
        else groups[key] = [item]
    }
    return groups
}

const haodooMapGroupBy = (items, callback) => {
    const groups = new Map()
    let index = 0
    for (const item of items) {
        const key = callback(item, index++)
        const current = groups.get(key)
        if (current) current.push(item)
        else groups.set(key, [item])
    }
    return groups
}

`

  const insertionPoint = 'const NS = {'
  if (!source.includes(insertionPoint)) {
    throw new Error('Could not locate the foliate-js epub.js insertion point for legacy groupBy helpers.')
  }

  source = source.replace(insertionPoint, helpers + insertionPoint)
  source = source.replaceAll('Object.groupBy(', 'haodooObjectGroupBy(')
  source = source.replaceAll('Map.groupBy(', 'haodooMapGroupBy(')
  applied.push('legacy groupBy helpers')
}

// Some Android WebViews can create blob URLs but cannot fetch() them or navigate a
// sandboxed iframe to them. Keep the rewritten textual EPUB resource alongside its
// blob URL so paginator.js can inject the exact same HTML through srcdoc/document.write.
const blobRegistryMarker = 'const haodooBlobTextRegistry = globalThis.__HAODOO_FOLIATE_BLOB_TEXT__'
if (!source.includes(blobRegistryMarker)) {
  const insertionPoint = 'const NS = {'
  const registryHelper = `const haodooBlobTextRegistry = globalThis.__HAODOO_FOLIATE_BLOB_TEXT__
    || (globalThis.__HAODOO_FOLIATE_BLOB_TEXT__ = new Map())

`
  if (!source.includes(insertionPoint)) {
    throw new Error('Could not locate the foliate-js epub.js insertion point for blob text registry.')
  }
  source = source.replace(insertionPoint, registryHelper + insertionPoint)

  const createUrlOriginal = `        const url = URL.createObjectURL(new Blob([newData], { type: newType }))\n        this.#cache.set(href, url)`
  const createUrlPatched = `        const url = URL.createObjectURL(new Blob([newData], { type: newType }))\n        if (typeof newData === 'string'\n        && [MIME.XHTML, MIME.HTML, MIME.SVG].includes(newType))\n            haodooBlobTextRegistry.set(url, newData)\n        this.#cache.set(href, url)`
  if (!source.includes(createUrlOriginal)) {
    throw new Error('Could not locate Loader.createURL() for WebView blob text registry patch.')
  }
  source = source.replace(createUrlOriginal, createUrlPatched)

  const unrefOriginal = `            URL.revokeObjectURL(this.#cache.get(href))\n            this.#cache.delete(href)`
  const unrefPatched = `            const url = this.#cache.get(href)\n            haodooBlobTextRegistry.delete(url)\n            URL.revokeObjectURL(url)\n            this.#cache.delete(href)`
  if (!source.includes(unrefOriginal)) {
    throw new Error('Could not locate Loader.unref() for WebView blob text registry cleanup.')
  }
  source = source.replace(unrefOriginal, unrefPatched)

  const destroyOriginal = `    destroy() {\n        for (const url of this.#cache.values()) URL.revokeObjectURL(url)\n    }`
  const destroyPatched = `    destroy() {\n        for (const url of this.#cache.values()) {\n            haodooBlobTextRegistry.delete(url)\n            URL.revokeObjectURL(url)\n        }\n    }`
  if (!source.includes(destroyOriginal)) {
    throw new Error('Could not locate Loader.destroy() for WebView blob text registry cleanup.')
  }
  source = source.replace(destroyOriginal, destroyPatched)
  applied.push('blob text registry')
}

await writeFile(target, source, 'utf8')

if (applied.length > 0) {
  console.log(`Applied foliate-js legacy WebView patches: ${applied.join(', ')}`)
} else {
  console.log('foliate-js legacy WebView patches already applied')
}
