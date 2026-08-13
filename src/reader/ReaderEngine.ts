export type ReaderResourceKind = 'epub' | 'verticalEpub'
export type ReaderWritingMode = 'source' | 'horizontal' | 'vertical'

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
  letterSpacing: number
  pageGap: number
  chromeMargin: number
  writingMode: ReaderWritingMode
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
  setPreferences(preferences: ReaderPreferences): Promise<void>
  onLocationChange(listener: (location: ReaderLocation) => void): () => void
}

export const DEFAULT_READER_PREFERENCES: ReaderPreferences = {
  fontScale: 100,
  lineHeight: 1.7,
  letterSpacing: 0.02,
  pageGap: 7,
  chromeMargin: 42,
  writingMode: 'source',
}
