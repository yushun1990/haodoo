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

// Phase D: Foliate owns the blob URL lifecycle; Haodoo mirrors rewritten textual
// resources in a dedicated in-memory registry. The bridge must be installed by the
// Reader before foliate-js is imported. No storage/persistence responsibility lives here.
const oldRegistryHelper = `const haodooBlobTextRegistry = globalThis.__HAODOO_FOLIATE_BLOB_TEXT__
    || (globalThis.__HAODOO_FOLIATE_BLOB_TEXT__ = new Map())

`
const registryBridgeMarker = 'const getHaodooBlobTextRegistry = () => {'
const registryBridgeHelper = `const getHaodooBlobTextRegistry = () => {
    const registry = globalThis.__HAODOO_BLOB_TEXT_REGISTRY__
    if (!registry?.register || !registry?.get || !registry?.delete || !registry?.clear)
        throw new Error('Haodoo BlobTextRegistry is not installed')
    return registry
}

`

if (source.includes(oldRegistryHelper)) {
  source = source.replace(oldRegistryHelper, '')
  applied.push('remove legacy global blob Map')
}

if (!source.includes(registryBridgeMarker)) {
  const insertionPoint = 'const NS = {'
  if (!source.includes(insertionPoint)) {
    throw new Error('Could not locate the foliate-js epub.js insertion point for BlobTextRegistry bridge.')
  }
  source = source.replace(insertionPoint, registryBridgeHelper + insertionPoint)
  applied.push('BlobTextRegistry bridge')
}

const createUrlOriginal = `        const url = URL.createObjectURL(new Blob([newData], { type: newType }))\n        this.#cache.set(href, url)`
const createUrlLegacy = `        const url = URL.createObjectURL(new Blob([newData], { type: newType }))\n        if (typeof newData === 'string'\n        && [MIME.XHTML, MIME.HTML, MIME.SVG].includes(newType))\n            haodooBlobTextRegistry.set(url, newData)\n        this.#cache.set(href, url)`
const createUrlPatched = `        const url = URL.createObjectURL(new Blob([newData], { type: newType }))\n        if (typeof newData === 'string'\n        && [MIME.XHTML, MIME.HTML, MIME.SVG].includes(newType))\n            getHaodooBlobTextRegistry().register(url, newData)\n        this.#cache.set(href, url)`

if (!source.includes(createUrlPatched)) {
  if (source.includes(createUrlLegacy)) source = source.replace(createUrlLegacy, createUrlPatched)
  else if (source.includes(createUrlOriginal)) source = source.replace(createUrlOriginal, createUrlPatched)
  else throw new Error('Could not locate Loader.createURL() for BlobTextRegistry lifecycle patch.')
  applied.push('BlobTextRegistry register on createURL')
}

const unrefOriginal = `            URL.revokeObjectURL(this.#cache.get(href))\n            this.#cache.delete(href)`
const unrefLegacy = `            const url = this.#cache.get(href)\n            haodooBlobTextRegistry.delete(url)\n            URL.revokeObjectURL(url)\n            this.#cache.delete(href)`
const unrefPatched = `            const url = this.#cache.get(href)\n            getHaodooBlobTextRegistry().delete(url)\n            URL.revokeObjectURL(url)\n            this.#cache.delete(href)`

if (!source.includes(unrefPatched)) {
  if (source.includes(unrefLegacy)) source = source.replace(unrefLegacy, unrefPatched)
  else if (source.includes(unrefOriginal)) source = source.replace(unrefOriginal, unrefPatched)
  else throw new Error('Could not locate Loader.unref() for BlobTextRegistry lifecycle patch.')
  applied.push('BlobTextRegistry delete on unref')
}

const destroyOriginal = `    destroy() {\n        for (const url of this.#cache.values()) URL.revokeObjectURL(url)\n    }`
const destroyLegacy = `    destroy() {\n        for (const url of this.#cache.values()) {\n            haodooBlobTextRegistry.delete(url)\n            URL.revokeObjectURL(url)\n        }\n    }`
const destroyPatched = `    destroy() {\n        for (const url of this.#cache.values()) {\n            getHaodooBlobTextRegistry().delete(url)\n            URL.revokeObjectURL(url)\n        }\n    }`

if (!source.includes(destroyPatched)) {
  if (source.includes(destroyLegacy)) source = source.replace(destroyLegacy, destroyPatched)
  else if (source.includes(destroyOriginal)) source = source.replace(destroyOriginal, destroyPatched)
  else throw new Error('Could not locate Loader.destroy() for BlobTextRegistry lifecycle patch.')
  applied.push('BlobTextRegistry delete on destroy')
}

await writeFile(target, source, 'utf8')

if (applied.length > 0) {
  console.log(`Applied foliate-js legacy WebView patches: ${applied.join(', ')}`)
} else {
  console.log('foliate-js legacy WebView patches already applied')
}
