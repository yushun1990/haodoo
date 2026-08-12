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

// Replace the complete section iframe loader by method boundaries instead of an exact
// multi-line source match. This keeps the patch idempotent and repairs partially
// patched local node_modules trees.
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
        return new Promise((resolve, reject) => {
            let settled = false
            let fallbackStarted = false
            let sourceHtmlPromise

            const cleanup = () => {
                clearTimeout(timeout)
                clearTimeout(fallbackTimer)
                this.#iframe.removeEventListener('load', onLoad)
                this.#iframe.removeEventListener('error', onError)
            }
            const finish = (callback, value) => {
                if (settled) return
                settled = true
                cleanup()
                callback(value)
            }
            const hasContent = doc => {
                const body = doc?.body
                if (!body) return false
                if (body.textContent?.trim()) return true
                return Boolean(body.querySelector('img, svg, video, canvas, math, object'))
            }
            const renderDocument = doc => {
                if (!doc?.documentElement || !doc.body) {
                    throw new Error('Foliate section iframe has no usable document/body')
                }

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

                // Some embedded WebViews do not expose document.fonts.
                doc.fonts?.ready?.then(() => this.expand())

                finish(resolve)
            }
            const getSourceHtml = () => {
                sourceHtmlPromise ??= fetch(src).then(async response => {
                    if (!response.ok) {
                        throw new Error(\`Foliate section blob fetch failed: ${'${response.status}'} ${'${response.statusText}'}\`)
                    }
                    const html = await response.text()
                    if (!html.trim()) throw new Error('Foliate section blob resolved to an empty document')
                    return html
                })
                return sourceHtmlPromise
            }
            const writeFallback = async () => {
                if (settled || fallbackStarted || !src.startsWith('blob:')) return
                fallbackStarted = true
                try {
                    const html = await getSourceHtml()
                    if (settled) return

                    // Cancel the unreliable blob navigation first. srcdoc is enough on most
                    // WebViews; if it still exposes an empty document, write the already-
                    // rewritten Foliate XHTML directly into the same sandboxed iframe.
                    this.#iframe.removeAttribute('src')
                    this.#iframe.srcdoc = html
                    await wait(80)

                    let doc = this.document
                    if (!hasContent(doc)) {
                        doc = this.document
                        if (!doc) throw new Error('Foliate iframe document is unavailable for direct-write fallback')
                        doc.open()
                        doc.write(html)
                        doc.close()
                        await wait(0)
                        doc = this.document
                    }

                    if (!hasContent(doc)) {
                        throw new Error('Foliate section HTML was fetched, but Via/WebView produced an empty iframe document')
                    }
                    renderDocument(doc)
                } catch (error) {
                    finish(
                        reject,
                        error instanceof Error
                            ? error
                            : new Error(\`Foliate direct-write fallback failed: ${'${String(error)}'}\`),
                    )
                }
            }
            const onError = () => {
                void writeFallback()
            }
            const onLoad = () => {
                if (settled || fallbackStarted) return
                const doc = this.document
                const documentURL = doc?.URL ?? ''

                // Android WebViews can deliver the iframe's delayed initial about:blank
                // load after Foliate has already assigned the blob section URL.
                if (src.startsWith('blob:') && (!documentURL || documentURL === 'about:blank')) {
                    void writeFallback()
                    return
                }

                // A more subtle WebView failure reports the blob navigation as loaded but
                // leaves body empty. Do not let that empty document satisfy View.load().
                if (src.startsWith('blob:') && !hasContent(doc)) {
                    void writeFallback()
                    return
                }

                try {
                    renderDocument(doc)
                } catch (error) {
                    finish(reject, error instanceof Error ? error : new Error(String(error)))
                }
            }

            // Normal browsers load the blob section immediately. If an embedded WebView
            // does not, bypass navigation and inject Foliate's rewritten section directly.
            const fallbackTimer = setTimeout(() => void writeFallback(), 900)

            const timeout = setTimeout(() => {
                const kind = src.startsWith('blob:') ? 'blob URL/direct-write fallback' : src
                finish(
                    reject,
                    new Error(\`Foliate section iframe did not load usable content within 8 seconds (${'${kind}'})\`),
                )
            }, 8000)

            this.#iframe.addEventListener('load', onLoad)
            this.#iframe.addEventListener('error', onError)
            this.#iframe.src = src
        })
    }
`

const currentLoadMethod = source.slice(loadStart, renderStart)
if (currentLoadMethod !== iframeLoadMethod) {
  source = source.slice(0, loadStart) + iframeLoadMethod + source.slice(renderStart)
  applied.push('View iframe direct-write compatibility')
}

await writeFile(target, source, 'utf8')

if (applied.length > 0) {
  console.log(`Applied foliate-js compatibility patches: ${applied.join(', ')}`)
} else {
  console.log('foliate-js compatibility patches already applied')
}
