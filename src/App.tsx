import { useEffect, useMemo, useState } from 'react'
import type { Book, BookPart, Catalog } from './domain/book'

const PAGE_SIZE = 48

function parseBookId(): string | undefined {
  const match = window.location.hash.match(/^#book\/(.+)$/)
  if (!match) return undefined
  try {
    return decodeURIComponent(match[1])
  } catch {
    return match[1]
  }
}

function useBookId(): string | undefined {
  const [bookId, setBookId] = useState(parseBookId)

  useEffect(() => {
    const onHashChange = () => {
      setBookId(parseBookId())
      window.scrollTo({ top: 0 })
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  return bookId
}

function useCatalog(): { catalog?: Catalog; error?: string } {
  const [catalog, setCatalog] = useState<Catalog>()
  const [error, setError] = useState<string>()

  useEffect(() => {
    const controller = new AbortController()

    fetch(`${import.meta.env.BASE_URL}data/catalog.json`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        return (await response.json()) as Catalog
      })
      .then(setCatalog)
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return
        const message = reason instanceof Error ? reason.message : String(reason)
        setError(`无法载入书目：${message}`)
      })

    return () => controller.abort()
  }, [])

  return { catalog, error }
}

function BookCover({ book, large = false }: { book: Book; large?: boolean }) {
  const [failed, setFailed] = useState(false)
  const className = large ? 'book-cover book-cover--large' : 'book-cover'

  return (
    <div className={className} aria-hidden="true">
      {book.cover && !failed ? (
        <img src={book.cover.url} alt="" loading="lazy" onError={() => setFailed(true)} />
      ) : (
        <div className="book-cover__fallback">
          <span>{book.title.slice(0, 8)}</span>
        </div>
      )}
    </div>
  )
}

function BookCard({ book }: { book: Book }) {
  return (
    <a className="book-card" href={`#book/${encodeURIComponent(book.id)}`}>
      <BookCover book={book} />
      <div className="book-card__body">
        <h2>{book.title}</h2>
        <p className="book-card__author">{book.author}</p>
        <div className="book-card__meta">
          {book.category && <span>{book.category}</span>}
          {book.series && <span>{book.series.name}</span>}
          {book.parts.length > 1 && <span>{book.parts.length} 册</span>}
        </div>
      </div>
    </a>
  )
}

function ResourceLinks({ part }: { part: BookPart }) {
  if (!part.epub && !part.verticalEpub) {
    return <span className="resource-empty">暂无 EPUB</span>
  }

  return (
    <div className="resource-row">
      {part.epub && (
        <a href={part.epub.url} target="_blank" rel="noreferrer">
          横排 EPUB
        </a>
      )}
      {part.verticalEpub && (
        <a href={part.verticalEpub.url} target="_blank" rel="noreferrer">
          竖排 EPUB
        </a>
      )}
    </div>
  )
}

function PartList({ book }: { book: Book }) {
  if (book.parts.length === 1) {
    return <ResourceLinks part={book.parts[0]} />
  }

  return (
    <section className="part-list" aria-label="卷册">
      <h2>卷册</h2>
      {book.parts.map((part, index) => (
        <article className="part-item" key={part.id}>
          <div>
            <strong>{part.title ?? part.track ?? `第 ${index + 1} 册`}</strong>
            {part.track && part.title && <span>{part.track}</span>}
          </div>
          <ResourceLinks part={part} />
        </article>
      ))}
    </section>
  )
}

function BookDetail({ book }: { book: Book }) {
  return (
    <main className="page page--detail">
      <a className="back-link" href="#">
        ← 返回书目
      </a>

      <section className="detail-card">
        <BookCover book={book} large />
        <div className="detail-card__body">
          <p className="eyebrow">Haodoo Classic · {book.id}</p>
          <h1>{book.title}</h1>
          <p className="detail-card__author">{book.author}</p>

          <dl className="book-facts">
            {book.category && (
              <>
                <dt>分类</dt>
                <dd>{book.category}</dd>
              </>
            )}
            {book.series && (
              <>
                <dt>系列</dt>
                <dd>
                  {book.series.name}
                  {book.series.order !== undefined ? ` · ${book.series.order}` : ''}
                </dd>
              </>
            )}
            {book.parts.length > 1 && (
              <>
                <dt>卷册</dt>
                <dd>{book.parts.length} 册</dd>
              </>
            )}
            {book.publishedAt && (
              <>
                <dt>收录</dt>
                <dd>{book.publishedAt}</dd>
              </>
            )}
          </dl>

          <PartList book={book} />

          {book.description && (
            <div className="description-link">
              <a href={book.description.url} target="_blank" rel="noreferrer">
                查看好读原始简介 ↗
              </a>
            </div>
          )}

          <button className="reader-placeholder" type="button" disabled>
            阅读器将在 P2 接入
          </button>
        </div>
      </section>
    </main>
  )
}

function CatalogPage({ catalog }: { catalog: Catalog }) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('全部')
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)

  const categories = useMemo(() => {
    const values = new Set<string>()
    for (const book of catalog.books) {
      if (book.category) values.add(book.category)
    }
    return ['全部', ...Array.from(values).sort((a, b) => a.localeCompare(b, 'zh-Hant'))]
  }, [catalog.books])

  const filteredBooks = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase()

    return catalog.books.filter((book) => {
      if (category !== '全部' && book.category !== category) return false
      if (!normalizedQuery) return true

      const partText = book.parts.flatMap((part) => [part.title, part.track])
      const haystack = [book.title, book.author, book.series?.name, ...partText]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase()
      return haystack.includes(normalizedQuery)
    })
  }, [catalog.books, category, query])

  useEffect(() => {
    setVisibleCount(PAGE_SIZE)
  }, [category, query])

  const visibleBooks = filteredBooks.slice(0, visibleCount)

  return (
    <main className="page">
      <header className="hero">
        <div>
          <p className="eyebrow">非官方 · 开源 · 本地优先</p>
          <h1>好读</h1>
          <p className="hero__subtitle">更方便地找书，更舒服地读书。</p>
        </div>
        <div className="hero__stat" title="当前 Classic 作品数量">
          <strong>{catalog.books.length.toLocaleString()}</strong>
          <span>部作品</span>
        </div>
      </header>

      <section className="catalog-tools" aria-label="书目检索">
        <label className="search-box">
          <span className="sr-only">搜索书名、作者、系列或卷册</span>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="m21 21-4.35-4.35m2.35-5.65a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z" />
          </svg>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索书名、作者或系列"
            autoComplete="off"
          />
          {query && (
            <button type="button" onClick={() => setQuery('')} aria-label="清空搜索">
              ×
            </button>
          )}
        </label>

        <div className="category-strip" aria-label="按分类筛选">
          {categories.map((item) => (
            <button
              key={item}
              type="button"
              className={item === category ? 'is-active' : undefined}
              onClick={() => setCategory(item)}
            >
              {item}
            </button>
          ))}
        </div>
      </section>

      <div className="result-summary">
        <span>{filteredBooks.length.toLocaleString()} 个结果</span>
        <span>数据来自 Haodoo Classic 官方 GitHub 归档</span>
      </div>

      {visibleBooks.length > 0 ? (
        <section className="book-grid" aria-label="书目">
          {visibleBooks.map((book) => (
            <BookCard key={book.id} book={book} />
          ))}
        </section>
      ) : (
        <section className="empty-state">
          <h2>没有找到</h2>
          <p>换个书名、作者，或清除分类再试试。</p>
        </section>
      )}

      {visibleCount < filteredBooks.length && (
        <button
          className="load-more"
          type="button"
          onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
        >
          显示更多
        </button>
      )}

      <footer className="site-footer">
        <p>Haodoo 是非官方客户端，不重新托管或主张拥有好读书籍内容。</p>
      </footer>
    </main>
  )
}

export default function App() {
  const { catalog, error } = useCatalog()
  const bookId = useBookId()

  if (error) {
    return (
      <main className="page status-page">
        <h1>书目没有准备好</h1>
        <p>{error}</p>
        <code>npm run sync:classic</code>
      </main>
    )
  }

  if (!catalog) {
    return (
      <main className="page status-page" aria-live="polite">
        <div className="loading-mark">好</div>
        <p>正在载入书目…</p>
      </main>
    )
  }

  if (bookId) {
    const book = catalog.books.find((item) => item.id === bookId)
    if (book) return <BookDetail book={book} />

    return (
      <main className="page status-page">
        <h1>找不到这本书</h1>
        <p>书码：{bookId}</p>
        <a className="back-link" href="#">
          ← 返回书目
        </a>
      </main>
    )
  }

  return <CatalogPage catalog={catalog} />
}
