import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

export const FOLIATE_PATCH_VERSION = '1.0.1'

export const FoliatePatchCategory = Object.freeze({
  UPSTREAM_HARDENING: 'upstream-hardening',
  HAODOO_WEBVIEW_ADAPTATION: 'haodoo-webview-adaptation',
})

export async function assertPinnedFoliateVersion() {
  const packagePath = resolve('node_modules/foliate-js/package.json')
  const metadata = JSON.parse(await readFile(packagePath, 'utf8'))
  if (metadata.version !== FOLIATE_PATCH_VERSION) {
    throw new Error(
      `Foliate compatibility patches are pinned to ${FOLIATE_PATCH_VERSION}, but node_modules contains ${metadata.version ?? 'unknown'}. Review docs/foliate-patches.md and the upstream source before upgrading.`,
    )
  }
}

export function replaceExact(source, { name, category, original, patched }) {
  if (source.includes(patched)) return { source, applied: false }
  if (!source.includes(original)) {
    throw new Error(
      `Foliate ${FOLIATE_PATCH_VERSION} source assertion failed for ${name} [${category}]. Refusing to patch unknown upstream code; review docs/foliate-patches.md before changing the pinned version.`,
    )
  }
  return {
    source: source.replace(original, patched),
    applied: true,
  }
}
