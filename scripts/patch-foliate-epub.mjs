import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import {
  assertPinnedFoliateVersion,
  FoliatePatchCategory,
  replaceExact,
} from './foliate-patch-policy.mjs'

await assertPinnedFoliateVersion()

const target = resolve('node_modules/foliate-js/epub.js')
let source = await readFile(target, 'utf8')
const applied = []

// Generic runtime compatibility belongs to public/legacy-webview.js. Migrate an
// already-patched local node_modules tree back to native Object.groupBy/Map.groupBy
// calls so Phase E leaves no language polyfill embedded in Foliate source.
const legacyGroupByHelpers = `const haodooObjectGroupBy = (items, callback) => {
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

if (source.includes(legacyGroupByHelpers)) {
  source = source.replace(legacyGroupByHelpers, '')
  source = source.replaceAll('haodooObjectGroupBy(', 'Object.groupBy(')
  source = source.replaceAll('haodooMapGroupBy(', 'Map.groupBy(')
  applied.push('generic-runtime-compatibility: remove legacy groupBy source rewriting')
}

if (source.includes('haodooObjectGroupBy(') || source.includes('haodooMapGroupBy(')) {
  throw new Error('Legacy groupBy source rewriting is partially present in foliate-js/epub.js')
}

// Category C — Haodoo WebView adaptation. Foliate owns blob URL creation and
// revocation; Haodoo mirrors rewritten text only for fallback section transports.
const registryBridgeMarker = 'const getHaodooBlobTextRegistry = () => {'
const registryBridgeHelper = `const getHaodooBlobTextRegistry = () => {
    const registry = globalThis.__HAODOO_BLOB_TEXT_REGISTRY__
    if (!registry?.register || !registry?.get || !registry?.delete || !registry?.clear)
        throw new Error('Haodoo BlobTextRegistry is not installed')
    return registry
}

`

if (!source.includes(registryBridgeMarker)) {
  const insertionPoint = 'const NS = {'
  if (!source.includes(insertionPoint)) {
    throw new Error('Foliate 1.0.1 source assertion failed: epub.js namespace insertion point changed')
  }
  source = source.replace(insertionPoint, registryBridgeHelper + insertionPoint)
  applied.push(`${FoliatePatchCategory.HAODOO_WEBVIEW_ADAPTATION}: BlobTextRegistry bridge`)
}

function applyPatch(name, original, patched) {
  const result = replaceExact(source, {
    name,
    category: FoliatePatchCategory.HAODOO_WEBVIEW_ADAPTATION,
    original,
    patched,
  })
  source = result.source
  if (result.applied) {
    applied.push(`${FoliatePatchCategory.HAODOO_WEBVIEW_ADAPTATION}: ${name}`)
  }
}

applyPatch(
  'BlobTextRegistry register on createURL',
  `        const url = URL.createObjectURL(new Blob([newData], { type: newType }))\n        this.#cache.set(href, url)`,
  `        const url = URL.createObjectURL(new Blob([newData], { type: newType }))\n        if (typeof newData === 'string'\n        && [MIME.XHTML, MIME.HTML, MIME.SVG].includes(newType))\n            getHaodooBlobTextRegistry().register(url, newData)\n        this.#cache.set(href, url)`,
)

applyPatch(
  'BlobTextRegistry delete on unref',
  `            URL.revokeObjectURL(this.#cache.get(href))\n            this.#cache.delete(href)`,
  `            const url = this.#cache.get(href)\n            getHaodooBlobTextRegistry().delete(url)\n            URL.revokeObjectURL(url)\n            this.#cache.delete(href)`,
)

applyPatch(
  'BlobTextRegistry delete on destroy',
  `    destroy() {\n        for (const url of this.#cache.values()) URL.revokeObjectURL(url)\n    }`,
  `    destroy() {\n        for (const url of this.#cache.values()) {\n            getHaodooBlobTextRegistry().delete(url)\n            URL.revokeObjectURL(url)\n        }\n    }`,
)

await writeFile(target, source, 'utf8')

if (applied.length > 0) {
  console.log(`Applied foliate-js EPUB patches: ${applied.join(', ')}`)
} else {
  console.log('foliate-js EPUB patches already applied')
}
