import assert from 'node:assert/strict'
import {
  BlobTextRegistry,
  installBlobTextRegistry,
} from '../src/reader/compatibility/BlobTextRegistry'

const registry = new BlobTextRegistry()

assert.equal(registry.size(), 0)
assert.throws(
  () => registry.register('https://example.test/chapter.xhtml', '<p>not a blob</p>'),
  /only accepts blob URLs/,
)

registry.register('blob:haodoo-a', '<p>A</p>')
registry.register('blob:haodoo-b', '<p>B</p>')
assert.equal(registry.size(), 2)
assert.equal(registry.get('blob:haodoo-a'), '<p>A</p>')
assert.equal(registry.get('blob:missing'), undefined)

registry.register('blob:haodoo-a', '<p>A2</p>')
assert.equal(registry.size(), 2)
assert.equal(registry.get('blob:haodoo-a'), '<p>A2</p>')

assert.equal(registry.delete('blob:haodoo-a'), true)
assert.equal(registry.delete('blob:haodoo-a'), false)
assert.equal(registry.size(), 1)

registry.clear()
assert.equal(registry.size(), 0)
assert.equal(registry.get('blob:haodoo-b'), undefined)

const installed = installBlobTextRegistry()
installed.clear()
assert.equal(installBlobTextRegistry(), installed, 'global bridge must be stable within one page/session')
installed.register('blob:haodoo-global', '<p>global</p>')
assert.equal(installed.get('blob:haodoo-global'), '<p>global</p>')
installed.clear()
assert.equal(installed.size(), 0)

console.log('BlobTextRegistry lifecycle tests passed')
