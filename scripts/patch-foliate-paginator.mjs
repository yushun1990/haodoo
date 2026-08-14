import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import {
  assertPinnedFoliateVersion,
  FoliatePatchCategory,
  replaceExact,
} from './foliate-patch-policy.mjs'

await assertPinnedFoliateVersion()

const target = resolve('node_modules/foliate-js/paginator.js')
let source = await readFile(target, 'utf8')
const applied = []

function applyPatch(name, category, original, patched) {
  const result = replaceExact(source, { name, category, original, patched })
  source = result.source
  if (result.applied) applied.push(`${category}: ${name}`)
}

// Category A — upstream hardening. These fix lifecycle/error-handling behavior
// independently of Haodoo's WebView transport adaptation.
applyPatch(
  'Paginator.render detached-document guard',
  FoliatePatchCategory.UPSTREAM_HARDENING,
  `    render() {\n        if (!this.#view) return\n        this.#view.render(this.#beforeRender({`,
  `    render() {\n        if (!this.#view?.document?.body) return\n        this.#view.render(this.#beforeRender({`,
)

applyPatch(
  'View.expand detached-document guard',
  FoliatePatchCategory.UPSTREAM_HARDENING,
  `    expand() {\n        const { documentElement } = this.document\n        if (this.#column) {`,
  `    expand() {\n        const document = this.document\n        if (!document?.documentElement) return\n        const { documentElement } = document\n        if (this.#column) {`,
)

applyPatch(
  'Paginator section-load error propagation',
  FoliatePatchCategory.UPSTREAM_HARDENING,
  `                .catch(e => {\n                    console.warn(e)\n                    console.warn(new Error(\`Failed to load section \${index}\`))\n                    return {}\n                }))`,
  `                .catch(e => {\n                    console.warn(new Error(\`Failed to load section \${index}\`))\n                    throw e\n                }))`,
)

applyPatch(
  'Paginator navigation lock finally guard',
  FoliatePatchCategory.UPSTREAM_HARDENING,
  `    async #turnPage(dir, distance) {\n        if (this.#locked) return\n        this.#locked = true\n        const prev = dir === -1\n        const shouldGo = await (prev ? this.#scrollPrev(distance) : this.#scrollNext(distance))\n        if (shouldGo) await this.#goTo({\n            index: this.#adjacentIndex(dir),\n            anchor: prev ? () => 1 : () => 0,\n        })\n        if (shouldGo || !this.hasAttribute('animated')) await wait(100)\n        this.#locked = false\n    }`,
  `    async #turnPage(dir, distance) {\n        if (this.#locked) return\n        this.#locked = true\n        try {\n            const prev = dir === -1\n            const shouldGo = await (prev ? this.#scrollPrev(distance) : this.#scrollNext(distance))\n            if (shouldGo) await this.#goTo({\n                index: this.#adjacentIndex(dir),\n                anchor: prev ? () => 1 : () => 0,\n            })\n            if (shouldGo || !this.hasAttribute('animated')) await wait(100)\n        } finally {\n            this.#locked = false\n        }\n    }`,
)

// Category C — Haodoo WebView adaptation. The whole upstream View.load method is
// asserted exactly. If Foliate changes this method, do not transplant Haodoo's
// loader bridge onto unknown code: fail and review the new upstream implementation.
const upstreamLoad = `    async load(src, afterLoad, beforeRender) {
        if (typeof src !== 'string') throw new Error(\`${'${src}'} is not string\`)
        return new Promise(resolve => {
            this.#iframe.addEventListener('load', () => {
                const doc = this.document
                afterLoad?.(doc)

                // it needs to be visible for Firefox to get computed style
                this.#iframe.style.display = 'block'
                const { vertical, rtl } = getDirection(doc)
                const background = getBackground(doc)
                this.#iframe.style.display = 'none'

                this.#vertical = vertical
                this.#rtl = rtl

                this.#contentRange.selectNodeContents(doc.body)
                const layout = beforeRender?.({ vertical, rtl, background })
                this.#iframe.style.display = 'block'
                this.render(layout)
                this.#observer.observe(doc.body)

                // the resize observer above doesn't work in Firefox
                // (see https://bugzilla.mozilla.org/show_bug.cgi?id=1832939)
                // until the bug is fixed we can at least account for font load
                doc.fonts.ready.then(() => this.expand())

                resolve()
            }, { once: true })
            this.#iframe.src = src
        })
    }
`

const haodooLoad = `    async load(src, afterLoad, beforeRender) {
        if (typeof src !== 'string') throw new Error(\`${'${src}'} is not string\`)

        const loader = globalThis.__HAODOO_SECTION_DOCUMENT_LOADER__
        if (!loader?.load) {
            const error = new Error('Haodoo SectionDocumentLoader is not installed')
            error.name = 'SectionDocumentTransportError'
            error.haodooReaderFailureKind = 'transport'
            throw error
        }

        let sourceHtmlPromise
        const getSourceHtml = () => {
            if (sourceHtmlPromise) return sourceHtmlPromise

            const registry = globalThis.__HAODOO_BLOB_TEXT_REGISTRY__
            const registered = registry?.get?.(src)
            if (typeof registered === 'string' && registered.trim()) {
                sourceHtmlPromise = Promise.resolve(registered)
                return sourceHtmlPromise
            }

            sourceHtmlPromise = fetch(src).then(async response => {
                if (!response.ok) {
                    throw new Error(\`Foliate section blob fetch failed: ${'${response.status}'} ${'${response.statusText}'}\`)
                }
                const html = await response.text()
                if (!html.trim()) throw new Error('Foliate section blob resolved to an empty document')
                return html
            })
            return sourceHtmlPromise
        }

        const stageError = (kind, error) => {
            if (error?.haodooReaderFailureKind) return error
            if (error?.kind === 'transport') {
                error.haodooReaderFailureKind = 'transport'
                return error
            }
            const message = error instanceof Error ? error.message : String(error)
            const wrapped = new Error(\`Foliate section ${'${kind}'} failed: ${'${message}'}\`, { cause: error })
            wrapped.name = kind === 'pagination'
                ? 'SectionPaginationError'
                : kind === 'render'
                    ? 'SectionRenderError'
                    : 'SectionDocumentTransportError'
            wrapped.haodooReaderFailureKind = kind
            return wrapped
        }

        const renderDocument = doc => {
            if (!doc?.documentElement || !doc.body) {
                throw stageError('render', new Error('Foliate section iframe has no usable document/body'))
            }

            let layout
            try {
                afterLoad?.(doc)

                // it needs to be visible for Firefox to get computed style
                this.#iframe.style.display = 'block'
                const { vertical, rtl } = getDirection(doc)
                const background = getBackground(doc)
                this.#iframe.style.display = 'none'

                this.#vertical = vertical
                this.#rtl = rtl

                this.#contentRange.selectNodeContents(doc.body)
                layout = beforeRender?.({ vertical, rtl, background })
            } catch (error) {
                throw stageError('render', error)
            }

            try {
                this.#iframe.style.display = 'block'
                this.render(layout)
                this.#observer.observe(doc.body)
                doc.fonts?.ready?.then(() => this.expand())
            } catch (error) {
                throw stageError('pagination', error)
            }
        }

        let loaded
        try {
            loaded = await loader.load({
                iframe: this.#iframe,
                source: src,
                getHtml: getSourceHtml,
            })
        } catch (error) {
            throw stageError('transport', error)
        }

        renderDocument(loaded.document)
    }
`

if (!source.includes(upstreamLoad) && !source.includes(haodooLoad)) {
  const startMarker = '    async load(src, afterLoad, beforeRender) {'
  const endMarker = '    render(layout) {'
  const start = source.indexOf(startMarker)
  const end = source.indexOf(endMarker, start)
  const actual = start >= 0 && end > start
    ? source.slice(start, end)
    : '<View.load method boundaries not found>'
  throw new Error(
    `Foliate 1.0.1 View.load source assertion failed. Actual installed method follows:\n---\n${actual}\n---`,
  )
}

applyPatch(
  'View SectionDocumentLoader bridge',
  FoliatePatchCategory.HAODOO_WEBVIEW_ADAPTATION,
  upstreamLoad,
  haodooLoad,
)

await writeFile(target, source, 'utf8')

if (applied.length > 0) {
  console.log(`Applied foliate-js paginator patches: ${applied.join(', ')}`)
} else {
  console.log('foliate-js paginator patches already applied')
}
