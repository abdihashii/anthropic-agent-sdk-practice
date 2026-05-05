const CACHE = 'agent-shell-v2'
// Cache '/' (canonical) NOT '/index.html'. Cloudflare Workers Assets
// 307-redirects /index.html -> / for canonical URL enforcement, and a
// SW serving a redirected response triggers "Response served by service
// worker has redirections" in Safari/Chrome (browsers refuse cached
// responses where response.redirected === true for navigation requests).
const SHELL = ['/', '/manifest.json', '/logo192.png', '/logo512.png', '/favicon.ico']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(SHELL))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return

  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return

  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/auth/') ||
    url.pathname === '/health'
  )
    return

  if (req.mode === 'navigate') {
    event.respondWith(
      caches
        .match('/')
        .then((cached) => cached || fetch(req))
        .catch(() => caches.match('/')),
    )
    return
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached
      return fetch(req).then((res) => {
        if (res.ok && res.type === 'basic') {
          const clone = res.clone()
          caches.open(CACHE).then((c) => c.put(req, clone))
        }
        return res
      })
    }),
  )
})
