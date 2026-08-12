import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'csv-parse/sync'
import { CatalogSchema } from '../src/domain/catalog.schema'
import type { Book, Catalog } from '../src/domain/book'

const CATALOG_URL =
  'https://raw.githubusercontent.com/haodoo/haodoo-classic/main/Haodoo_Catalog_Table.csv'
const CLASSIC_RAW_ROOT =
  'https://raw.githubusercontent.com/haodoo/haodoo-classic/main/html/'

interface ClassicRow {
  book_code?: string
  book_title?: string
  author_name?: string
  category_name?: string
  description_link?: string
  cover_image?: string
  bin_loc?: string
  volume_track?: string
  volume_title?: string
  series_name?: string
  series_order?: string
  file_epub?: string
  file_vepub?: string
  first_published?: string
  last_modified?: string
}

function value(input: string | undefined): string | undefined {
  const normalized = input?.trim()
  if (!normalized || normalized === '[NA]' || normalized === 'N/A') {
    return undefined
  }
  return normalized
}

function parseDate(input: string | undefined): string | undefined {
  const normalized = value(input)
  if (!normalized) return undefined

  const iso = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (iso) {
    const [, year, month, day] = iso
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  }

  const us = normalized.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!us) return undefined

  const [, month, day, year] = us
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
}

function parseNumber(input: string | undefined): number | undefined {
  const normalized = value(input)
  if (!normalized) return undefined
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : undefined
}

function classicUrl(path: string): string {
  return new URL(path.replace(/^\/+/, ''), CLASSIC_RAW_ROOT).toString()
}

function toBook(row: ClassicRow): Book | undefined {
  const id = value(row.book_code)
  const title = value(row.book_title)
  if (!id || !title) return undefined

  const bin = value(row.bin_loc)
  const epubFile = value(row.file_epub)
  const verticalEpubFile = value(row.file_vepub)
  const coverFile = value(row.cover_image)
  const descriptionPath = value(row.description_link)
  const seriesName = value(row.series_name)
  const volumeTrack = value(row.volume_track)
  const volumeTitle = value(row.volume_title)

  return {
    id,
    title,
    author: value(row.author_name) ?? '未知作者',
    category: value(row.category_name),
    series: seriesName
      ? {
          name: seriesName,
          order: parseNumber(row.series_order),
        }
      : undefined,
    volume:
      volumeTrack || volumeTitle
        ? {
            track: volumeTrack,
            title: volumeTitle,
          }
        : undefined,
    cover: coverFile
      ? {
          url: classicUrl(`covers/${coverFile}`),
        }
      : undefined,
    description: descriptionPath
      ? {
          url: classicUrl(descriptionPath),
          mediaType: 'text/html',
        }
      : undefined,
    epub:
      bin && epubFile
        ? {
            url: classicUrl(`PDB/${bin}/${epubFile}`),
            mediaType: 'application/epub+zip',
          }
        : undefined,
    verticalEpub:
      bin && verticalEpubFile
        ? {
            url: classicUrl(`PDB/${bin}/${verticalEpubFile}`),
            mediaType: 'application/epub+zip',
          }
        : undefined,
    publishedAt: parseDate(row.first_published),
    modifiedAt: parseDate(row.last_modified),
    source: {
      kind: 'haodoo-classic',
      id,
    },
  }
}

function sortBooks(books: Book[]): Book[] {
  return books.sort((left, right) => {
    const byDate = (right.publishedAt ?? '').localeCompare(left.publishedAt ?? '')
    if (byDate !== 0) return byDate
    return left.title.localeCompare(right.title, 'zh-Hant')
  })
}

async function main(): Promise<void> {
  const response = await fetch(CATALOG_URL)
  if (!response.ok) {
    throw new Error(`Failed to fetch Classic catalog: HTTP ${response.status}`)
  }

  const csv = await response.text()
  const rows = parse(csv, {
    bom: true,
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true,
  }) as ClassicRow[]

  const books: Book[] = []
  const seen = new Set<string>()

  for (const row of rows) {
    const book = toBook(row)
    if (!book) continue
    if (seen.has(book.id)) {
      throw new Error(`Duplicate Classic book id: ${book.id}`)
    }
    seen.add(book.id)
    books.push(book)
  }

  const catalog: Catalog = {
    schemaVersion: 1,
    source: 'haodoo-classic',
    sourceUrl: CATALOG_URL,
    generatedAt: new Date().toISOString(),
    books: sortBooks(books),
  }

  const validated = CatalogSchema.parse(catalog)
  const scriptDir = dirname(fileURLToPath(import.meta.url))
  const output = resolve(scriptDir, '../public/data/catalog.json')

  await mkdir(dirname(output), { recursive: true })
  await writeFile(output, `${JSON.stringify(validated)}\n`, 'utf8')

  const withCover = validated.books.filter((book) => book.cover).length
  const withEpub = validated.books.filter((book) => book.epub).length
  const withVerticalEpub = validated.books.filter((book) => book.verticalEpub).length

  console.log(
    `Classic catalog: ${validated.books.length} books, ${withCover} covers, ${withEpub} EPUBs, ${withVerticalEpub} vertical EPUBs`,
  )
  console.log(`Wrote ${output}`)
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
