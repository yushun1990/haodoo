import { existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { chromium, firefox } from 'playwright-core'

const baseUrl = 'http://127.0.0.1:4173'
const browserName = process.env.READER_BROWSER ?? 'chromium'

if (!['chromium', 'firefox'].includes(browserName)) {
  throw new Error(`Unsupported READER_BROWSER: ${browserName}`)
}

const chromeCandidates = [
  process.env.CHROME_PATH,
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean)

const chromiumPath = chromeCandidates.find((path) => existsSync(path))
if (browserName === 'chromium' && !chromiumPath) {
  throw new Error(`No system Chromium found. Checked: ${chromeCandidates.join(', ')}`)
}

const browserType = browserName === 'firefox' ? firefox : chromium
const server = spawn(
  process.execPath,
  ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', '4173'],
  { stdio: 'ignore' },
)

const waitForServer = async () => {
  const deadline = Date.now() + 20_000
  while (Date.now() < deadline) {
    try {
      const response = await fetch(baseUrl)
      if (response.ok) return
    } catch {
      // Preview is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error('Vite preview did not start in time')
}

const openCatalog = async (page) => {
  await page.goto(baseUrl, { waitUntil: 'networkidle' })
}

const openBookBySearch = async (page, query, titlePattern) => {
  await openCatalog(page)
  await page.getByPlaceholder('搜索书名、作者或系列').fill(query)
  const heading = page.locator('.book-card h2').filter({ hasText: titlePattern }).first()
  await heading.waitFor()
  await heading.click()
  await page.locator('.detail-card h1').filter({ hasText: titlePattern }).waitFor()
}

const waitReaderReady = async (page) => {
  await page.waitForFunction(() => {
    const button = [...document.querySelectorAll('button')].find((item) => item.textContent?.trim() === '下一页')
    return button && !button.disabled
  }, undefined, { timeout: 30_000 })

  await page.waitForFunction(
    () => document.querySelector('.reader-progress strong')?.textContent?.trim() !== '—',
    undefined,
    { timeout: 30_000 },
  )
}

const readingPositions = async (page) =>
  page.evaluate(() =>
    Object.keys(localStorage)
      .filter((key) => key.startsWith('haodoo.reader.position.v1:'))
      .sort()
      .map((key) => ({ key, value: localStorage.getItem(key) })),
  )

const currentPosition = async (page) => {
  const positions = await readingPositions(page)
  const hash = decodeURIComponent(new URL(page.url()).hash)
  const route = hash.match(/^#read\/([^/]+)\/([^/]+)\/(epub|verticalEpub)$/)
  if (!route) throw new Error(`Not on a reader route: ${hash}`)

  const [, bookId, partId, kind] = route
  const suffix = `:${bookId}:${partId}:${kind}`
  const position = positions.find((item) => item.key.endsWith(suffix))
  if (!position?.value) throw new Error(`No persisted reader position for ${suffix}`)
  return position
}

const currentWritingMode = async (page) =>
  page.evaluate(() => {
    const view = document.querySelector('.reader-engine-view')
    const renderer = view?.renderer
    const doc = renderer?.getContents?.()[0]?.doc
    if (!doc?.body || !doc.defaultView) return null
    return doc.defaultView.getComputedStyle(doc.body).writingMode
  })

const waitForWritingMode = async (page, expected) => {
  await page.waitForFunction(
    (mode) => {
      const view = document.querySelector('.reader-engine-view')
      const renderer = view?.renderer
      const doc = renderer?.getContents?.()[0]?.doc
      return Boolean(doc?.body && doc.defaultView?.getComputedStyle(doc.body).writingMode === mode)
    },
    expected,
    { timeout: 30_000 },
  )
}

let browser
try {
  await waitForServer()
  browser = await browserType.launch(
    browserName === 'chromium'
      ? { executablePath: chromiumPath, headless: true }
      : { headless: true },
  )

  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    ...(browserName === 'chromium' ? { isMobile: true, hasTouch: true } : {}),
  })
  const page = await context.newPage()

  let stage = 'startup'
  const browserErrors = []
  page.on('pageerror', (error) => {
    browserErrors.push({ stage, message: error.message, stack: error.stack })
  })

  stage = 'little-prince-horizontal-open'
  console.log(`[${browserName}] Reader smoke A: 《【小王子】》 horizontal open → page → CFI restore`)
  await openBookBySearch(page, '小王子', /^【小王子】$/)
  await page.getByRole('link', { name: '阅读横式' }).click()
  await waitReaderReady(page)

  stage = 'little-prince-horizontal-next'
  const initial = await currentPosition(page)
  const nextButton = page.getByRole('button', { name: '下一页' })
  await nextButton.click()
  await page.waitForFunction(
    ({ key, value }) => localStorage.getItem(key) !== value,
    initial,
    { timeout: 15_000 },
  )
  const advanced = await currentPosition(page)

  stage = 'little-prince-horizontal-reopen'
  await page.locator('.reader-toolbar--top a[aria-label="返回书籍"]').click()
  await page.getByRole('link', { name: '阅读横式' }).click()
  await waitReaderReady(page)
  await new Promise((resolve) => setTimeout(resolve, 300))
  const restored = await currentPosition(page)
  if (restored.value !== advanced.value) {
    throw new Error('Little Prince horizontal CFI was not restored')
  }

  stage = 'little-prince-vertical-open'
  console.log(`[${browserName}] Reader smoke A2: 《【小王子】》 original vertical EPUB opens independently`)
  await page.locator('.reader-toolbar--top a[aria-label="返回书籍"]').click()
  await page.getByRole('link', { name: '阅读直式' }).click()
  await waitReaderReady(page)
  const verticalPosition = await currentPosition(page)
  if (!verticalPosition.key.endsWith(':verticalEpub')) {
    throw new Error('Vertical EPUB did not persist under its own resource kind')
  }
  if (verticalPosition.key === advanced.key) {
    throw new Error('Horizontal and vertical EPUB positions share the same storage key')
  }

  stage = 'foundation-first-part'
  console.log(`[${browserName}] Reader smoke B: 《基地系列》 keeps readable BookPart positions isolated`)
  await openBookBySearch(page, '基地系列', /基地系列/)
  const readableParts = page.locator('.part-item:has(a.read-button[href$="/epub"])')
  const readablePartCount = await readableParts.count()
  if (readablePartCount < 2) {
    throw new Error(`Foundation sample needs two horizontal-readable parts, got ${readablePartCount}`)
  }

  await readableParts.nth(0).getByRole('link', { name: '阅读横式' }).click()
  await waitReaderReady(page)
  const foundationPartOne = await currentPosition(page)
  stage = 'foundation-second-part'
  await page.locator('.reader-toolbar--top a[aria-label="返回书籍"]').click()

  await readableParts.nth(1).getByRole('link', { name: '阅读横式' }).click()
  await waitReaderReady(page)
  const foundationPartTwo = await currentPosition(page)
  if (foundationPartOne.key === foundationPartTwo.key) {
    throw new Error('Different Foundation BookParts share the same reading-position key')
  }

  stage = 'old-man-open'
  console.log(`[${browserName}] Reader smoke C: 《老人與海》 CJK typography + runtime writing-mode reflow`)
  await openBookBySearch(page, '老人與海', /老人與海/)
  await page.getByRole('link', { name: '阅读横式' }).click()
  await waitReaderReady(page)
  const oldManInitial = await currentPosition(page)

  stage = 'old-man-next'
  await page.getByRole('button', { name: '下一页' }).click()
  await page.waitForFunction(
    ({ key, value }) => localStorage.getItem(key) !== value,
    oldManInitial,
    { timeout: 15_000 },
  )

  stage = 'old-man-typography'
  await page.getByRole('button', { name: '排版' }).click()
  const fontSize = page.locator('.reader-settings label').filter({ hasText: '字号' }).locator('input')
  const lineHeight = page.locator('.reader-settings label').filter({ hasText: '行距' }).locator('input')
  const letterSpacing = page.locator('.reader-settings label').filter({ hasText: '字距' }).locator('input')
  await fontSize.fill('120')
  await lineHeight.fill('1.9')
  await letterSpacing.fill('0.06')
  await page.waitForTimeout(250)

  const activeNext = page.getByRole('button', { name: '下一页' })
  if (await activeNext.isDisabled()) throw new Error('Reader became unavailable after typography changes')
  stage = 'old-man-after-typography-next'
  await activeNext.click()
  await page.waitForTimeout(150)
  await currentPosition(page)

  stage = 'old-man-force-vertical'
  const beforeVertical = await currentPosition(page)
  await page.getByRole('button', { name: '竖排' }).click()
  await waitReaderReady(page)
  await waitForWritingMode(page, 'vertical-rl')
  const verticalMode = await currentWritingMode(page)
  if (verticalMode !== 'vertical-rl') {
    throw new Error(`Forced vertical mode did not reach the EPUB document: ${verticalMode}`)
  }

  const afterVerticalReflow = await currentPosition(page)
  if (afterVerticalReflow.key !== beforeVertical.key) {
    throw new Error('Writing-mode reflow changed the reading-position storage key')
  }

  stage = 'old-man-vertical-next'
  await page.getByRole('button', { name: '下一页' }).click()
  await page.waitForFunction(
    ({ key, value }) => localStorage.getItem(key) !== value,
    afterVerticalReflow,
    { timeout: 15_000 },
  )

  stage = 'old-man-force-horizontal'
  await page.getByRole('button', { name: '横排' }).click()
  await waitReaderReady(page)
  await waitForWritingMode(page, 'horizontal-tb')
  const horizontalMode = await currentWritingMode(page)
  if (horizontalMode !== 'horizontal-tb') {
    throw new Error(`Forced horizontal mode did not reach the EPUB document: ${horizontalMode}`)
  }
  await currentPosition(page)

  if (browserErrors.length) {
    const detail = browserErrors
      .map((error) => `[${error.stage}] ${error.stack ?? error.message}`)
      .join('\n---\n')
    throw new Error(`Browser page errors:\n${detail}`)
  }

  console.log(
    `[${browserName}] Reader smoke passed: 3 real books, CFI restore, multi-part isolation, CJK typography, horizontal + vertical reflow`,
  )
} finally {
  await browser?.close()
  server.kill('SIGTERM')
}
