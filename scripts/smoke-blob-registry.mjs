import { existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { chromium, firefox } from 'playwright-core'

const baseUrl = 'http://127.0.0.1:4173'
const browserName = process.env.READER_BROWSER ?? 'chromium'

if (!['chromium', 'firefox'].includes(browserName)) {
  throw new Error(`Unsupported READER_BROWSER: ${browserName}`)
}

const chromiumPath = [
  process.env.CHROME_PATH,
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean).find((path) => existsSync(path))

if (browserName === 'chromium' && !chromiumPath) {
  throw new Error('No system Chromium found for BlobTextRegistry smoke')
}

const browserType = browserName === 'firefox' ? firefox : chromium
const server = spawn(
  process.execPath,
  ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', '4173'],
  { stdio: 'ignore' },
)

async function waitForServer() {
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

async function openLittlePrince(page) {
  await page.goto(baseUrl, { waitUntil: 'networkidle' })
  await page.getByPlaceholder('搜索书名、作者或系列').fill('小王子')
  const heading = page.locator('.book-card h2').filter({ hasText: /^【小王子】$/ }).first()
  await heading.waitFor()
  await heading.click()
  await page.getByRole('link', { name: '阅读横式' }).click()
  await page.waitForFunction(() => {
    const button = [...document.querySelectorAll('button')].find((item) => item.textContent?.trim() === '下一页')
    return button && !button.disabled
  }, undefined, { timeout: 30_000 })
}

async function assertRegistryLive(page) {
  await page.waitForFunction(() => globalThis.__HAODOO_BLOB_TEXT_REGISTRY__?.size?.() > 0, undefined, {
    timeout: 15_000,
  })

  return page.evaluate(() => {
    const registry = globalThis.__HAODOO_BLOB_TEXT_REGISTRY__
    if (!registry?.register || !registry?.get || !registry?.delete || !registry?.clear || !registry?.size) {
      throw new Error('BlobTextRegistry bridge is incomplete')
    }
    if (globalThis.__HAODOO_FOLIATE_BLOB_TEXT__ !== undefined) {
      throw new Error('Legacy global blob-text Map is still exposed')
    }
    return registry.size()
  })
}

async function closeReaderAndAssertEmpty(page) {
  await page.locator('.reader-toolbar--top a[aria-label="返回书籍"]').click()
  await page.waitForFunction(() => globalThis.__HAODOO_BLOB_TEXT_REGISTRY__?.size?.() === 0, undefined, {
    timeout: 10_000,
  })
}

let browser
try {
  await waitForServer()
  browser = await browserType.launch(
    browserName === 'firefox'
      ? { headless: true }
      : { executablePath: chromiumPath, headless: true },
  )
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
  const pageErrors = []
  page.on('pageerror', (error) => pageErrors.push(error))

  console.log(`[${browserName}] BlobTextRegistry smoke: register → destroy cleanup → reopen → cleanup`)
  await openLittlePrince(page)
  const firstSize = await assertRegistryLive(page)
  await closeReaderAndAssertEmpty(page)

  await page.getByRole('link', { name: '阅读横式' }).click()
  await page.waitForFunction(() => globalThis.__HAODOO_BLOB_TEXT_REGISTRY__?.size?.() > 0, undefined, {
    timeout: 15_000,
  })
  const secondSize = await assertRegistryLive(page)
  await closeReaderAndAssertEmpty(page)

  if (pageErrors.length) {
    throw new Error(pageErrors.map((error) => error.stack ?? error.message).join('\n---\n'))
  }

  console.log(`[${browserName}] BlobTextRegistry smoke passed: first=${firstSize}, reopen=${secondSize}, destroy=0`)
} finally {
  await browser?.close()
  server.kill('SIGTERM')
}
