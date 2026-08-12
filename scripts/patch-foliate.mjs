import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const target = resolve('node_modules/foliate-js/paginator.js')
const original = `    render() {
        if (!this.#view) return
        this.#view.render(this.#beforeRender({`
const patched = `    render() {
        if (!this.#view?.document?.body) return
        this.#view.render(this.#beforeRender({`

const source = await readFile(target, 'utf8')

if (source.includes(patched)) {
  console.log('foliate-js paginator lifecycle patch already applied')
} else if (source.includes(original)) {
  await writeFile(target, source.replace(original, patched), 'utf8')
  console.log('Applied foliate-js #150 paginator lifecycle patch')
} else {
  throw new Error(
    'foliate-js paginator source no longer matches the 1.0.1 compatibility patch. Review upstream issue #150 before upgrading.',
  )
}
