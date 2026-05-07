const CACHE = 'agent-shell-v3'
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
    (async () => {
      // Enable navigation preload so the network fetch starts in parallel
      // with SW boot; pairs with the network-first navigation handler below.
      if (self.registration.navigationPreload) {
        await self.registration.navigationPreload.enable()
      }
      const keys = await caches.keys()
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      await self.clients.claim()
    })(),
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
    // Network-first: always try fresh HTML so deploys are picked up
    // immediately. Prefer the navigation-preload response (started in
    // parallel with SW boot) over a fresh fetch. Cache under canonical
    // '/' so the offline fallback is consistent regardless of which SPA
    // path was requested (same canonical-redirect gotcha that drives
    // the precache key).
    event.respondWith(
      (async () => {
        try {
          const preload = event.preloadResponse ? await event.preloadResponse : null
          const res = preload || (await fetch(req))
          if (res.ok) {
            const clone = res.clone()
            caches.open(CACHE).then((c) => c.put('/', clone))
          }
          return res
        } catch {
          const cached = await caches.match('/')
          if (cached) return cached
          throw new Error('offline and no cached shell')
        }
      })(),
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
