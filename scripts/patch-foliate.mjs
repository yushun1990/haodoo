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
