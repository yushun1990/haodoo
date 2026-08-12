import { existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { chromium } from 'playwright-core'

const baseUrl = 'http://127.0.0.1:4173'
const chromeCandidates = [
  process.env.CHROME_PATH,
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean)

const executablePath = chromeCandidates.find((path) => existsSync(path))
if (!executablePath) {
  throw new Error(`No system Chromium found. Checked: ${chromeCandidates.join(', ')}`)
}

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

let browser
try {
  await waitForServer()
  browser = await chromium.launch({ executablePath, headless: true })
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } })

  const browserErrors = []
  page.on('pageerror', (error) => browserErrors.push(error.message))

  console.log('Reader smoke: opening catalog')
  await page.goto(baseUrl, { waitUntil: 'networkidle' })
  await page.getByPlaceholder('搜索书名、作者或系列').fill('小王子')

  const princeHeading = page.locator('.book-card h2').filter({ hasText: /^【小王子】$/ }).first()
  await princeHeading.waitFor()
  await princeHeading.click()
  await page.locator('.detail-card h1').filter({ hasText: /^【小王子】$/ }).waitFor()

  console.log('Reader smoke: opening real remote EPUB')
  await page.getByRole('link', { name: '阅读横式' }).click()

  const nextButton = page.getByRole('button', { name: '下一页' })
  await page.waitForFunction(() => {
    const button = [...document.querySelectorAll('button')].find((item) => item.textContent?.trim() === '下一页')
    return button && !button.disabled
  }, undefined, { timeout: 30_000 })

  await page.waitForFunction(
    () => document.querySelector('.reader-progress strong')?.textContent?.trim() !== '—',
    undefined,
    { timeout: 30_000 },
  )

  const position = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((item) => item.startsWith('haodoo.reader.position.v1:'))
    return key ? { key, value: localStorage.getItem(key) } : null
  })

  if (!position?.key || !position.value) {
    throw new Error('Reader did not persist an EPUB CFI position')
  }

  console.log('Reader smoke: paging and checking CFI change')
  await nextButton.click()
  await page.waitForFunction(
    ({ key, value }) => localStorage.getItem(key) !== value,
    position,
    { timeout: 15_000 },
  )

  const advancedValue = await page.evaluate((key) => localStorage.getItem(key), position.key)
  if (!advancedValue) throw new Error('Reader position disappeared after paging')

  console.log('Reader smoke: reopening and checking CFI restore')
  await page.locator('.reader-toolbar--top a[aria-label="返回书籍"]').click()
  await page.getByRole('link', { name: '阅读横式' }).click()
  await page.waitForFunction(() => {
    const button = [...document.querySelectorAll('button')].find((item) => item.textContent?.trim() === '下一页')
    return button && !button.disabled
  }, undefined, { timeout: 30_000 })
  await page.waitForFunction(
    () => document.querySelector('.reader-progress strong')?.textContent?.trim() !== '—',
    undefined,
    { timeout: 30_000 },
  )

  await new Promise((resolve) => setTimeout(resolve, 500))
  const restoredValue = await page.evaluate((key) => localStorage.getItem(key), position.key)
  if (restoredValue !== advancedValue) {
    throw new Error('Reader did not restore the previously persisted CFI')
  }

  if (browserErrors.length) {
    throw new Error(`Browser page errors: ${browserErrors.join(' | ')}`)
  }

  console.log('Reader smoke test passed: search → open remote EPUB → page → persist CFI → restore CFI')
} finally {
  await browser?.close()
  server.kill('SIGTERM')
}
