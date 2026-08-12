import type { ReaderLocation, ReaderResourceKind } from './ReaderEngine'

const STORAGE_PREFIX = 'haodoo.reader.position.v1'

export function readingPositionKey(
  sourceKind: string,
  bookId: string,
  partId: string,
  resourceKind: ReaderResourceKind,
): string {
  return [STORAGE_PREFIX, sourceKind, bookId, partId, resourceKind].join(':')
}

export function loadReadingPosition(key: string): ReaderLocation | undefined {
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return undefined
    const value = JSON.parse(raw) as Partial<ReaderLocation>
    if (typeof value.cfi !== 'string' || !value.cfi) return undefined
    return {
      cfi: value.cfi,
      fraction: typeof value.fraction === 'number' ? value.fraction : undefined,
      chapter: typeof value.chapter === 'string' ? value.chapter : undefined,
    }
  } catch {
    return undefined
  }
}

export function saveReadingPosition(key: string, location: ReaderLocation): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(location))
  } catch {
    // Storage can be unavailable in private mode or when quota is exhausted.
    // P2 keeps reading functional even when persistence fails.
  }
}
