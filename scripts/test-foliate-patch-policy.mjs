import assert from 'node:assert/strict'
import { FoliatePatchCategory, replaceExact } from './foliate-patch-policy.mjs'

const original = 'upstream-1.0.1'
const patched = 'haodoo-patched'

const first = replaceExact(original, {
  name: 'policy smoke',
  category: FoliatePatchCategory.UPSTREAM_HARDENING,
  original,
  patched,
})
assert.equal(first.source, patched)
assert.equal(first.applied, true)

const rerun = replaceExact(patched, {
  name: 'policy smoke',
  category: FoliatePatchCategory.UPSTREAM_HARDENING,
  original,
  patched,
})
assert.equal(rerun.source, patched)
assert.equal(rerun.applied, false)

assert.throws(
  () =>
    replaceExact('unknown-upstream-shape', {
      name: 'policy smoke',
      category: FoliatePatchCategory.UPSTREAM_HARDENING,
      original,
      patched,
    }),
  /Refusing to patch unknown upstream code/,
)

console.log('Foliate patch fail-fast policy tests passed')
