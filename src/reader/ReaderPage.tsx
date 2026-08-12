import { useEffect, useMemo, useRef, useState } from 'react'
import type { Book, BookPart } from '../domain/book'
import {
  DEFAULT_READER_PREFERENCES,
  type ReaderEngine,
  type ReaderLocation,
  type ReaderPreferences,
  type ReaderResourceKind,
  type ReaderTocItem,
} from './ReaderEngine'
import {
  loadReadingPosition,
  readingPositionKey,
  saveReadingPosition,
} from './reading-position'

interface ReaderPageProps {
  book: Book
  part: BookPart
  resourceKind: ReaderResourceKind
}

function TocTree({
  items,
  onSelect,
}: {
  items: ReaderTocItem[]
  onSelect: (href: string) => void
}) {
  return (
    <ul className="reader-toc__list">
      {items.map((item) => (
        <li key={`${item.href}:${item.label}`}>
          <button type="button" onClick={() => onSelect(item.href)}>
            {item.label}
          </button>
          {item.children.length > 0 && <TocTree items={item.children} onSelect={onSelect} />}
        </li>
      ))}
    </ul>
  )
}

function ReaderSettings({
  preferences,
  onChange,
}: {
  preferences: ReaderPreferences
  onChange: (next: ReaderPreferences) => void
}) {
  const update = <K extends keyof ReaderPreferences>(key: K, value: ReaderPreferences[K]) => {
    onChange({ ...preferences, [key]: value })
  }

  return (
    <div className="reader-settings">
      <label>
        <span>字号</span>
        <strong>{preferences.fontScale}%</strong>
        <input
          type="range"
          min="85"
          max="150"
          step="5"
          value={preferences.fontScale}
          onChange={(event) => update('fontScale', Number(event.target.value))}
        />
      </label>
      <label>
        <span>行距</span>
        <strong>{preferences.lineHeight.toFixed(1)}</strong>
        <input
          type="range"
          min="1.2"
          max="2.2"
          step="0.1"
          value={preferences.lineHeight}
          onChange={(event) => update('lineHeight', Number(event.target.value))}
        />
      </label>
      <label>
        <span>页边距</span>
        <strong>{preferences.pageGap}%</strong>
        <input
          type="range"
          min="3"
          max="14"
          step="1"
          value={preferences.pageGap}
          onChange={(event) => update('pageGap', Number(event.target.value))}
        />
      </label>
    </div>
  )
}

export function ReaderPage({ book, part, resourceKind }: ReaderPageProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const engineRef = useRef<ReaderEngine | undefined>(undefined)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState<string>()
  const [toc, setToc] = useState<ReaderTocItem[]>([])
  const [location, setLocation] = useState<ReaderLocation>()
  const [preferences, setPreferences] = useState(DEFAULT_READER_PREFERENCES)
  const [tocOpen, setTocOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [chromeVisible, setChromeVisible] = useState(true)

  const resource = resourceKind === 'verticalEpub' ? part.verticalEpub : part.epub
  const title = part.title ?? (book.parts.length > 1 ? part.track : undefined) ?? book.title
  const positionKey = useMemo(
    () => readingPositionKey(book.source.kind, book.id, part.id, resourceKind),
    [book.id, book.source.kind, part.id, resourceKind],
  )

  useEffect(() => {
    document.body.classList.add('is-reading')
    return () => document.body.classList.remove('is-reading')
  }, [])

  useEffect(() => {
    if (!resource || !containerRef.current) {
      setStatus('error')
      setError('这个卷册没有可用的 EPUB 资源。')
      return
    }

    let active = true
    let unsubscribe: (() => void) | undefined
    let engine: ReaderEngine | undefined

    const start = async () => {
      try {
        setStatus('loading')
        setError(undefined)

        const module = await import('./FoliateReaderEngine')
        if (!active || !containerRef.current) return

        engine = new module.FoliateReaderEngine()
        engineRef.current = engine
        unsubscribe = engine.onLocationChange((nextLocation) => {
          if (!active) return
          setLocation(nextLocation)
          saveReadingPosition(positionKey, nextLocation)
        })

        await engine.open(
          containerRef.current,
          { id: `${book.id}:${part.id}:${resourceKind}`, url: resource.url, kind: resourceKind },
          {
            location: loadReadingPosition(positionKey),
            preferences,
          },
        )

        if (!active) return
        setToc(engine.getToc())
        setStatus('ready')
      } catch (reason: unknown) {
        if (!active) return
        const message = reason instanceof Error ? reason.message : String(reason)
        setError(`无法打开 EPUB：${message}`)
        setStatus('error')
      }
    }

    void start()

    return () => {
      active = false
      unsubscribe?.()
      engine?.close()
      if (engineRef.current === engine) engineRef.current = undefined
    }
  }, [book.id, part.id, positionKey, resource, resourceKind])

  useEffect(() => {
    engineRef.current?.setPreferences(preferences)
  }, [preferences])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.matches('input, button, select, textarea')) return

      if (event.key === 'PageDown' || event.key === ' ') {
        event.preventDefault()
        void engineRef.current?.next()
      } else if (event.key === 'PageUp') {
        event.preventDefault()
        void engineRef.current?.prev()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const selectToc = (href: string) => {
    setTocOpen(false)
    void engineRef.current?.goTo(href)
  }

  const progress =
    typeof location?.fraction === 'number'
      ? `${Math.max(0, Math.min(100, location.fraction * 100)).toFixed(1)}%`
      : undefined

  return (
    <main className={`reader-shell ${chromeVisible ? '' : 'reader-shell--clean'}`}>
      <div className="reader-viewport" ref={containerRef} aria-label="EPUB 阅读区域" />

      {status === 'loading' && (
        <div className="reader-state" aria-live="polite">
          <div className="loading-mark">读</div>
          <p>正在打开《{title}》…</p>
        </div>
      )}

      {status === 'error' && (
        <div className="reader-state reader-state--error">
          <h1>这本书暂时打不开</h1>
          <p>{error}</p>
          <div>
            <a href={`#book/${encodeURIComponent(book.id)}`}>返回书籍</a>
            {resource && (
              <a href={resource.url} target="_blank" rel="noreferrer">
                下载原始 EPUB
              </a>
            )}
          </div>
        </div>
      )}

      <header className="reader-toolbar reader-toolbar--top">
        <a className="reader-icon-button" href={`#book/${encodeURIComponent(book.id)}`} aria-label="返回书籍">
          ←
        </a>
        <div className="reader-title">
          <strong>{title}</strong>
          <span>{book.author}</span>
        </div>
        <button
          className="reader-icon-button"
          type="button"
          onClick={() => setChromeVisible(false)}
          aria-label="隐藏阅读工具栏"
        >
          ×
        </button>
      </header>

      <footer className="reader-toolbar reader-toolbar--bottom">
        <button type="button" onClick={() => void engineRef.current?.prev()} disabled={status !== 'ready'}>
          上一页
        </button>
        <button type="button" onClick={() => setTocOpen(true)} disabled={status !== 'ready'}>
          目录
        </button>
        <div className="reader-progress" title={location?.chapter}>
          <strong>{progress ?? '—'}</strong>
          <span>{location?.chapter ?? (resourceKind === 'verticalEpub' ? '直式 EPUB' : '横式 EPUB')}</span>
        </div>
        <button type="button" onClick={() => setSettingsOpen((value) => !value)} disabled={status !== 'ready'}>
          排版
        </button>
        <button type="button" onClick={() => void engineRef.current?.next()} disabled={status !== 'ready'}>
          下一页
        </button>
      </footer>

      {!chromeVisible && (
        <button
          className="reader-show-chrome"
          type="button"
          onClick={() => setChromeVisible(true)}
          aria-label="显示阅读工具栏"
        >
          ···
        </button>
      )}

      {settingsOpen && chromeVisible && (
        <aside className="reader-panel reader-panel--settings" aria-label="阅读排版设置">
          <div className="reader-panel__head">
            <strong>基础排版</strong>
            <button type="button" onClick={() => setSettingsOpen(false)} aria-label="关闭排版设置">
              ×
            </button>
          </div>
          <ReaderSettings preferences={preferences} onChange={setPreferences} />
          <p>P2 只提供基线设置；字体、主题、中文横竖排专项在 P3 处理。</p>
        </aside>
      )}

      {tocOpen && (
        <div className="reader-drawer-backdrop" role="presentation" onClick={() => setTocOpen(false)}>
          <aside className="reader-panel reader-toc" aria-label="目录" onClick={(event) => event.stopPropagation()}>
            <div className="reader-panel__head">
              <strong>目录</strong>
              <button type="button" onClick={() => setTocOpen(false)} aria-label="关闭目录">
                ×
              </button>
            </div>
            {toc.length > 0 ? <TocTree items={toc} onSelect={selectToc} /> : <p>这本 EPUB 没有目录。</p>}
          </aside>
        </div>
      )}
    </main>
  )
}
