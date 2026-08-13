export interface BlobTextRegistryContract {
  register(url: string, text: string): void
  get(url: string): string | undefined
  delete(url: string): boolean
  clear(): void
  size(): number
}

export class BlobTextRegistry implements BlobTextRegistryContract {
  #entries = new Map<string, string>()

  register(url: string, text: string): void {
    if (!url.startsWith('blob:')) {
      throw new TypeError(`BlobTextRegistry only accepts blob URLs: ${url}`)
    }
    this.#entries.set(url, text)
  }

  get(url: string): string | undefined {
    return this.#entries.get(url)
  }

  delete(url: string): boolean {
    return this.#entries.delete(url)
  }

  clear(): void {
    this.#entries.clear()
  }

  size(): number {
    return this.#entries.size
  }
}

type BlobTextRegistryGlobal = typeof globalThis & {
  __HAODOO_BLOB_TEXT_REGISTRY__?: BlobTextRegistryContract
}

const registry = new BlobTextRegistry()

export function installBlobTextRegistry(): BlobTextRegistryContract {
  const runtime = globalThis as BlobTextRegistryGlobal
  if (runtime.__HAODOO_BLOB_TEXT_REGISTRY__) return runtime.__HAODOO_BLOB_TEXT_REGISTRY__
  runtime.__HAODOO_BLOB_TEXT_REGISTRY__ = registry
  return registry
}

export function getBlobTextRegistry(): BlobTextRegistryContract {
  return installBlobTextRegistry()
}
