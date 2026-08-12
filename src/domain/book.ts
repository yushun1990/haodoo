export type BookSourceKind = 'haodoo-classic' | 'haodoo-modern'

export interface BookSourceRef {
  kind: BookSourceKind
  id: string
}

export interface BookResource {
  url: string
  mediaType?: string
}

export interface BookSeries {
  name: string
  order?: number
}

export interface BookVolume {
  track?: string
  title?: string
}

export interface Book {
  id: string
  title: string
  author: string
  category?: string
  series?: BookSeries
  volume?: BookVolume
  cover?: BookResource
  description?: BookResource
  epub?: BookResource
  verticalEpub?: BookResource
  publishedAt?: string
  modifiedAt?: string
  source: BookSourceRef
}

export interface Catalog {
  schemaVersion: 1
  source: 'haodoo-classic'
  sourceUrl: string
  generatedAt: string
  books: Book[]
}
