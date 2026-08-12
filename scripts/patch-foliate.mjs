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
            const finish = (callback, value) => {
                if (settled) return
                settled = true
                clearTimeout(timeout)
                callback(value)
            }
            const timeout = setTimeout(() => {
                const kind = src.startsWith('blob:') ? 'blob URL' : src
                finish(reject, new Error(\`Foliate section iframe load event did not complete within 8 seconds (${'${kind}'})\`))
            }, 8000)

            this.#iframe.addEventListener('load', () => {
                try {
                    const doc = this.document
                    if (!doc?.documentElement || !doc.body) {
                        throw new Error('Foliate section iframe fired load without a usable document/body')
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
            }, { once: true })
            this.#iframe.addEventListener('error', () => {
                finish(reject, new Error('Foliate section iframe emitted an error event while loading'))
            }, { once: true })
            this.#iframe.src = src
        })
    }
`

const currentLoadMethod = source.slice(loadStart, renderStart)
if (currentLoadMethod !== iframeLoadMethod) {
  source = source.slice(0, loadStart) + iframeLoadMethod + source.slice(renderStart)
  applied.push('View iframe-load diagnostics')
}

await writeFile(target, source, 'utf8')

if (applied.length > 0) {
  console.log(`Applied foliate-js compatibility patches: ${applied.join(', ')}`)
} else {
  console.log('foliate-js compatibility patches already applied')
}
