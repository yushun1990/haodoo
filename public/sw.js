const CACHE_NAME = 'haodoo-shell-v4'
const APP_SHELL = [
  './',
  './manifest.webmanifest',
  './legacy-webview.js?v=2',
  './icon.svg',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-192.png',
  './icon-maskable-512.png',
]

const putIfCacheable = async (request, response) => {
  if (response?.ok) {
    const cache = await caches.open(CACHE_NAME)
    await cache.put(request, response.clone())
  }
  return response
}

const networkFirst = async (request, fallback) => {
  try {
    return await putIfCacheable(request, await fetch(request))
  } catch {
    return (await caches.match(request)) || (fallback ? await caches.match(fallback) : undefined)
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, './'))
    return
  }

  const pathname = url.pathname
  const isCodeAsset =
    pathname.endsWith('.js') ||
    pathname.endsWith('.css') ||
    pathname.endsWith('.webmanifest') ||
    pathname.includes('/assets/')

  if (isCodeAsset) {
    event.respondWith(networkFirst(request))
    return
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => putIfCacheable(request, response))
        .catch(() => cached)
      return cached || network
    }),
  )
})
