/* HokTify SW v5 — Enhanced Offline Support */
const CACHE = 'sw-v5'
const STATIC = ['/', '/style.css', '/script.js', '/manifest.json']

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(STATIC))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url)

  // Skip non-GET and API calls (let them fail naturally offline)
  if (e.request.method !== 'GET') return
  if (url.pathname.startsWith('/api/')) {
    // For API: try network, fallback to cache
    e.respondWith(
      fetch(e.request)
        .then(res => {
          if (res.ok) {
            const clone = res.clone()
            caches.open(CACHE).then(c => c.put(e.request, clone))
          }
          return res
        })
        .catch(() => caches.match(e.request).then(cached => cached || new Response(
          JSON.stringify({ results: [], error: 'offline' }),
          { headers: { 'Content-Type': 'application/json' } }
        )))
    )
    return
  }

  // Skip YouTube/external media (can't cache due to CORS/DRM)
  if (url.hostname.includes('youtube') || url.hostname.includes('ytimg') || url.hostname.includes('googlevideo')) {
    return
  }

  // For thumbnails: cache-first
  if (url.hostname.includes('i.ytimg') || url.pathname.match(/\.(jpg|jpeg|png|webp|gif)$/i)) {
    e.respondWith(
      caches.match(e.request).then(cached => {
        if (cached) return cached
        return fetch(e.request).then(res => {
          if (res.ok) {
            caches.open(CACHE).then(c => c.put(e.request, res.clone()))
          }
          return res
        }).catch(() => cached || new Response('', { status: 503 }))
      })
    )
    return
  }

  // For static assets: cache-first with network update
  e.respondWith(
    caches.match(e.request).then(cached => {
      const net = fetch(e.request).then(res => {
        if (res.ok) caches.open(CACHE).then(c => c.put(e.request, res.clone()))
        return res
      }).catch(() => cached)
      return cached || net
    })
  )
})
