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

// Replace the complete section iframe loader by method boundaries instead of an exact
// multi-line source match. This makes the patch idempotent and also repairs local
// node_modules trees that were partially patched by an earlier version of this script.
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
            let usingSrcdoc = false

            const cleanup = () => {
                clearTimeout(timeout)
                clearTimeout(srcdocFallbackTimer)
                this.#iframe.removeEventListener('load', onLoad)
                this.#iframe.removeEventListener('error', onError)
            }
            const finish = (callback, value) => {
                if (settled) return
                settled = true
                cleanup()
                callback(value)
            }
            const onError = () => {
                finish(reject, new Error('Foliate section iframe emitted an error event while loading'))
            }
            const onLoad = () => {
                const doc = this.document
                const documentURL = doc?.URL ?? ''

                // Some Android WebViews fire a delayed initial about:blank load after the
                // iframe has already been inserted into the DOM. Foliate creates and appends
                // the iframe before View.load() runs, so treating that event as the requested
                // section would incorrectly mark an empty document as loaded.
                if (!usingSrcdoc && src.startsWith('blob:') && (!documentURL || documentURL === 'about:blank')) {
                    return
                }
                if (usingSrcdoc && documentURL === 'about:blank') return

                try {
                    if (!doc?.documentElement || !doc.body) {
                        throw new Error(
                            \`Foliate section iframe loaded without a usable document/body (${'${documentURL || \'unknown URL\'}'})\`,
                        )
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
                } catch (error) {
                    finish(reject, error instanceof Error ? error : new Error(String(error)))
                }
            }

            // If a WebView cannot navigate a sandboxed iframe to a blob URL reliably,
            // fetch the already-rewritten Foliate section and feed it through srcdoc.
            // Normal browsers settle long before this fallback runs.
            const srcdocFallbackTimer = setTimeout(async () => {
                if (settled || !src.startsWith('blob:')) return
                try {
                    const response = await fetch(src)
                    const html = await response.text()
                    if (settled) return
                    if (!html.trim()) throw new Error('Foliate section blob resolved to an empty document')
                    usingSrcdoc = true
                    this.#iframe.removeAttribute('src')
                    this.#iframe.srcdoc = html
                } catch (error) {
                    finish(
                        reject,
                        error instanceof Error
                            ? error
                            : new Error(\`Foliate srcdoc fallback failed: ${'${String(error)}'}\`),
                    )
                }
            }, 1200)

            const timeout = setTimeout(() => {
                const kind = src.startsWith('blob:') ? 'blob URL/srcdoc fallback' : src
                finish(
                    reject,
                    new Error(\`Foliate section iframe did not load usable content within 8 seconds (${'${kind}'})\`),
                )
            }, 8000)

            this.#iframe.addEventListener('load', onLoad)
            this.#iframe.addEventListener('error', onError, { once: true })
            this.#iframe.src = src
        })
    }
`

const currentLoadMethod = source.slice(loadStart, renderStart)
if (currentLoadMethod !== iframeLoadMethod) {
  source = source.slice(0, loadStart) + iframeLoadMethod + source.slice(renderStart)
  applied.push('View iframe blob/srcdoc compatibility')
}

await writeFile(target, source, 'utf8')

if (applied.length > 0) {
  console.log(`Applied foliate-js compatibility patches: ${applied.join(', ')}`)
} else {
  console.log('foliate-js compatibility patches already applied')
}
