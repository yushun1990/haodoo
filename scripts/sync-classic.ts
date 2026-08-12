import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'csv-parse/sync'
import { CatalogSchema } from '../src/domain/catalog.schema'
import type { Book, BookPart, Catalog } from '../src/domain/book'

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

function fileStem(file: string | undefined): string | undefined {
  const normalized = value(file)
  if (!normalized) return undefined
  return normalized.replace(/\.[^.]+$/, '')
}

function partId(bookId: string, row: ClassicRow): string {
  return (
    fileStem(row.file_epub) ??
    fileStem(row.file_vepub) ??
    value(row.volume_track) ??
    value(row.volume_title) ??
    bookId
  )
}

function toPart(bookId: string, row: ClassicRow): BookPart {
  const bin = value(row.bin_loc)
  const epubFile = value(row.file_epub)
  const verticalEpubFile = value(row.file_vepub)

  return {
    id: partId(bookId, row),
    track: value(row.volume_track),
    title: value(row.volume_title),
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
  }
}

function toBook(row: ClassicRow): Book | undefined {
  const id = value(row.book_code)
  const title = value(row.book_title)
  if (!id || !title) return undefined

  const coverFile = value(row.cover_image)
  const descriptionPath = value(row.description_link)
  const seriesName = value(row.series_name)

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
    parts: [toPart(id, row)],
    publishedAt: parseDate(row.first_published),
    modifiedAt: parseDate(row.last_modified),
    source: {
      kind: 'haodoo-classic',
      id,
    },
  }
}

function latestDate(left: string | undefined, right: string | undefined): string | undefined {
  if (!left) return right
  if (!right) return left
  return left >= right ? left : right
}

function mergeBook(current: Book, incoming: Book): Book {
  const existingParts = new Map(current.parts.map((part) => [part.id, part]))
  for (const part of incoming.parts) {
    if (!existingParts.has(part.id)) {
      existingParts.set(part.id, part)
    }
  }

  return {
    ...current,
    category: current.category ?? incoming.category,
    series: current.series ?? incoming.series,
    cover: current.cover ?? incoming.cover,
    description: current.description ?? incoming.description,
    parts: Array.from(existingParts.values()),
    publishedAt: latestDate(current.publishedAt, incoming.publishedAt),
    modifiedAt: latestDate(current.modifiedAt, incoming.modifiedAt),
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

  const booksById = new Map<string, Book>()

  for (const row of rows) {
    const incoming = toBook(row)
    if (!incoming) continue

    const current = booksById.get(incoming.id)
    booksById.set(incoming.id, current ? mergeBook(current, incoming) : incoming)
  }

  const catalog: Catalog = {
    schemaVersion: 1,
    source: 'haodoo-classic',
    sourceUrl: CATALOG_URL,
    generatedAt: new Date().toISOString(),
    books: sortBooks(Array.from(booksById.values())),
  }

  const validated = CatalogSchema.parse(catalog)
  const scriptDir = dirname(fileURLToPath(import.meta.url))
  const output = resolve(scriptDir, '../public/data/catalog.json')

  await mkdir(dirname(output), { recursive: true })
  await writeFile(output, `${JSON.stringify(validated)}\n`, 'utf8')

  const parts = validated.books.flatMap((book) => book.parts)
  const withCover = validated.books.filter((book) => book.cover).length
  const withEpub = parts.filter((part) => part.epub).length
  const withVerticalEpub = parts.filter((part) => part.verticalEpub).length
  const multipartBooks = validated.books.filter((book) => book.parts.length > 1).length

  console.log(
    `Classic catalog: ${validated.books.length} books / ${parts.length} parts; ${multipartBooks} multi-part books`,
  )
  console.log(
    `Resources: ${withCover} covers, ${withEpub} EPUBs, ${withVerticalEpub} vertical EPUBs`,
  )
  console.log(`Wrote ${output}`)
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
