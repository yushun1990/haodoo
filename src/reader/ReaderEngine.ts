export type ReaderResourceKind = 'epub' | 'verticalEpub'

export interface ReaderSource {
  id: string
  url: string
  kind: ReaderResourceKind
}

export interface ReaderLocation {
  cfi: string
  fraction?: number
  chapter?: string
}

export interface ReaderTocItem {
  label: string
  href: string
  children: ReaderTocItem[]
}

export interface ReaderPreferences {
  fontScale: number
  lineHeight: number
  pageGap: number
  chromeMargin: number
}

export interface ReaderOpenOptions {
  location?: ReaderLocation
  preferences: ReaderPreferences
}

export interface ReaderEngine {
  open(container: HTMLElement, source: ReaderSource, options: ReaderOpenOptions): Promise<void>
  close(): void
  next(): Promise<void>
  prev(): Promise<void>
  goTo(target: string): Promise<void>
  getToc(): ReaderTocItem[]
  setPreferences(preferences: ReaderPreferences): void
  onLocationChange(listener: (location: ReaderLocation) => void): () => void
}

export const DEFAULT_READER_PREFERENCES: ReaderPreferences = {
  fontScale: 100,
  lineHeight: 1.7,
  pageGap: 7,
  chromeMargin: 42,
}
