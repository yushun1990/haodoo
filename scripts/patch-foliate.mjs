import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const target = resolve('node_modules/foliate-js/paginator.js')
let source = await readFile(target, 'utf8')
const applied = []

function applyExact(name, original, patched) {
  if (source.includes(patched)) return
  if (!source.includes(original)) {
    throw new Error(
      `foliate-js paginator source no longer matches the 1.0.1 compatibility patch: ${name}. Review upstream issues #146 and #150 before upgrading.`,
    )
  }
  source = source.replace(original, patched)
  applied.push(name)
}

applyExact(
  'Paginator.render detached-document guard',
  `    render() {\n        if (!this.#view) return\n        this.#view.render(this.#beforeRender({`,
  `    render() {\n        if (!this.#view?.document?.body) return\n        this.#view.render(this.#beforeRender({`,
)

applyExact(
  'View.expand detached-document guard',
  `    expand() {\n        const { documentElement } = this.document\n        if (this.#column) {`,
  `    expand() {\n        const document = this.document\n        if (!document?.documentElement) return\n        const { documentElement } = document\n        if (this.#column) {`,
)

const swallowedSectionError = `                .catch(e => {\n                    console.warn(e)\n                    console.warn(new Error(\`Failed to load section \${index}\`))\n                    return {}\n                }))`
const propagatedSectionError = `                .catch(e => {\n                    console.warn(new Error(\`Failed to load section \${index}\`))\n                    throw e\n                }))`

if (!source.includes(propagatedSectionError)) {
  if (!source.includes(swallowedSectionError)) {
    throw new Error(
      'foliate-js paginator source no longer matches the section-load compatibility patch. Review upstream issue #146 before upgrading.',
    )
  }
  source = source.replace(swallowedSectionError, propagatedSectionError)
  applied.push('Paginator section-load error propagation')
}

// Foliate locks page navigation while a turn is in progress. If loading the next
// section rejects, upstream currently exits before clearing the lock. Embedded
// WebView failures therefore make every later Next/Previous tap a no-op. Keep the
// lock lifecycle exception-safe.
const turnPageOriginal = `    async #turnPage(dir, distance) {\n        if (this.#locked) return\n        this.#locked = true\n        const prev = dir === -1\n        const shouldGo = await (prev ? this.#scrollPrev(distance) : this.#scrollNext(distance))\n        if (shouldGo) await this.#goTo({\n            index: this.#adjacentIndex(dir),\n            anchor: prev ? () => 1 : () => 0,\n        })\n        if (shouldGo || !this.hasAttribute('animated')) await wait(100)\n        this.#locked = false\n    }`
const turnPagePatched = `    async #turnPage(dir, distance) {\n        if (this.#locked) return\n        this.#locked = true\n        try {\n            const prev = dir === -1\n            const shouldGo = await (prev ? this.#scrollPrev(distance) : this.#scrollNext(distance))\n            if (shouldGo) await this.#goTo({\n                index: this.#adjacentIndex(dir),\n                anchor: prev ? () => 1 : () => 0,\n            })\n            if (shouldGo || !this.hasAttribute('animated')) await wait(100)\n        } finally {\n            this.#locked = false\n        }\n    }`

if (!source.includes(turnPagePatched)) {
  if (!source.includes(turnPageOriginal)) {
    throw new Error(
      'foliate-js paginator source no longer matches the navigation-lock patch. Review paginator #turnPage before upgrading.',
    )
  }
  source = source.replace(turnPageOriginal, turnPagePatched)
  applied.push('Paginator navigation lock finally guard')
}

// Foliate still owns section semantics and pagination. Haodoo only replaces the
// transport choice that gets a usable Document into Foliate's sandboxed iframe.
// The application installs __HAODOO_SECTION_DOCUMENT_LOADER__ before importing
// foliate-js. BlobTextRegistry remains the current HTML source until Phase D.
const loadMethodStart = '    async load(src, afterLoad, beforeRender) {'
const renderMethodStart = '    render(layout) {'
const loadStart = source.indexOf(loadMethodStart)
const renderStart = source.indexOf(renderMethodStart, loadStart)

if (loadStart < 0 || renderStart < 0 || renderStart <= loadStart) {
  throw new Error(
    'Could not locate Foliate paginator View.load()/render() method boundaries. Review foliate-js before upgrading.',
  )
}

const iframeLoadMethod = `    async load(src, afterLoad, beforeRender) {
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

            const registry = globalThis.__HAODOO_FOLIATE_BLOB_TEXT__
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

                // It needs to be visible for Firefox to get computed style.
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

const currentLoadMethod = source.slice(loadStart, renderStart)
if (currentLoadMethod !== iframeLoadMethod) {
  source = source.slice(0, loadStart) + iframeLoadMethod + source.slice(renderStart)
  applied.push('View SectionDocumentLoader bridge')
}

await writeFile(target, source, 'utf8')

if (applied.length > 0) {
  console.log(`Applied foliate-js compatibility patches: ${applied.join(', ')}`)
} else {
  console.log('foliate-js compatibility patches already applied')
}
