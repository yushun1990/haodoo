import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const target = resolve('node_modules/foliate-js/epub.js')
let source = await readFile(target, 'utf8')

const marker = 'const haodooObjectGroupBy = (items, callback) => {'

if (!source.includes(marker)) {
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
  await writeFile(target, source, 'utf8')
  console.log('Applied foliate-js legacy WebView groupBy patch')
} else {
  console.log('foliate-js legacy WebView groupBy patch already applied')
}
