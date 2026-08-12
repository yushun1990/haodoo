import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const target = resolve('node_modules/foliate-js/paginator.js')
const replacements = [
  {
    name: 'Paginator.render detached-document guard',
    original: `    render() {
        if (!this.#view) return
        this.#view.render(this.#beforeRender({`,
    patched: `    render() {
        if (!this.#view?.document?.body) return
        this.#view.render(this.#beforeRender({`,
  },
  {
    name: 'View.expand detached-document guard',
    original: `    expand() {
        const { documentElement } = this.document
        if (this.#column) {`,
    patched: `    expand() {
        const document = this.document
        if (!document?.documentElement) return
        const { documentElement } = document
        if (this.#column) {`,
  },
  {
    name: 'Paginator section-load error propagation',
    original: `                .catch(e => {
                    console.warn(e)
                    console.warn(new Error(\`Failed to load section \${index}\`))
                    return {}
                }))`,
    patched: `                .catch(e => {
                    console.warn(new Error(\`Failed to load section \${index}\`))
                    throw e
                }))`,
  },
  {
    name: 'View iframe-load error propagation',
    original: `        return new Promise(resolve => {
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
        })`,
    patched: `        return new Promise((resolve, reject) => {
            let settled = false
            const finish = (callback, value) => {
                if (settled) return
                settled = true
                clearTimeout(timeout)
                callback(value)
            }
            const timeout = setTimeout(() => {
                const kind = src.startsWith('blob:') ? 'blob URL' : src
                finish(reject, new Error(\`Foliate section iframe load event did not complete within 8 seconds (\${kind})\`))
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
        })`,
  },
]

let source = await readFile(target, 'utf8')
const applied = []

for (const replacement of replacements) {
  if (source.includes(replacement.patched)) continue
  if (!source.includes(replacement.original)) {
    throw new Error(
      `foliate-js paginator source no longer matches the 1.0.1 compatibility patch: ${replacement.name}. Review upstream issues #146 and #150 before upgrading.`,
    )
  }
  source = source.replace(replacement.original, replacement.patched)
  applied.push(replacement.name)
}

if (applied.length > 0) {
  await writeFile(target, source, 'utf8')
  console.log(`Applied foliate-js compatibility patches: ${applied.join(', ')}`)
} else {
  console.log('foliate-js compatibility patches already applied')
}
