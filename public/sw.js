// Service Worker — Gaiatec Sistemas
// ----------------------------------------
// Estratégias de cache:
//  - Assets com hash (/assets/*.js, /assets/*.css): cache-first (imutável)
//  - Fonts (Google Fonts + local TTF):              cache-first
//  - Imagens (/images/*, /favicon, /logo, /hero):   stale-while-revalidate
//  - HTML / API:                                    network-first com fallback offline
//
// Bump CACHE_VERSION sempre que mudar a estratégia para invalidar caches antigos.

const CACHE_VERSION = 'v1'
const STATIC_CACHE = `gaiatec-static-${CACHE_VERSION}`
const IMAGE_CACHE = `gaiatec-images-${CACHE_VERSION}`
const FONT_CACHE = `gaiatec-fonts-${CACHE_VERSION}`
const HTML_CACHE = `gaiatec-html-${CACHE_VERSION}`

const ALL_CACHES = [STATIC_CACHE, IMAGE_CACHE, FONT_CACHE, HTML_CACHE]

// === INSTALL ===
self.addEventListener('install', (event) => {
  // Pula a fase "waiting" — ativa o novo SW imediatamente
  self.skipWaiting()
})

// === ACTIVATE ===
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Limpa caches antigos (versões anteriores)
      const cacheNames = await caches.keys()
      await Promise.all(
        cacheNames
          .filter((name) => name.startsWith('gaiatec-') && !ALL_CACHES.includes(name))
          .map((name) => caches.delete(name))
      )

      // Toma controle de todas as abas abertas (sem precisar reload)
      await self.clients.claim()
    })()
  )
})

// === Helper: garante que respondWith sempre recebe um Response ===
async function resolveOrFallback(promise, fallback) {
  try {
    const result = await promise
    if (result instanceof Response) return result
    if (fallback) return fallback
    return new Response('Service Worker error', { status: 500 })
  } catch (err) {
    if (fallback) return fallback
    return new Response('Network error', { status: 503 })
  }
}

// === Strategies ===

// CACHE-FIRST: tenta cache, senão network, salva no cache
async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName)
  const cached = await cache.match(request)
  if (cached) return cached

  try {
    const response = await fetch(request)
    if (response.ok && response.status < 400) {
      // Clone porque a resposta só pode ser consumida uma vez
      cache.put(request, response.clone()).catch(() => {})
    }
    return response
  } catch (err) {
    return new Response('Offline', { status: 503 })
  }
}

// STALE-WHILE-REVALIDATE: retorna cache imediatamente, atualiza em background
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName)
  const cached = await cache.match(request)

  // Atualiza em background (não bloqueia)
  const fetchPromise = fetch(request)
    .then((response) => {
      if (response.ok && response.status < 400) {
        cache.put(request, response.clone()).catch(() => {})
      }
      return response
    })
    .catch(() => null)

  // Se tem cache, retorna imediatamente; senão aguarda network
  if (cached) {
    fetchPromise // fire and forget
    return cached
  }

  const networkResponse = await fetchPromise
  if (networkResponse instanceof Response) return networkResponse
  return new Response('Offline', { status: 503 })
}

// NETWORK-FIRST: tenta network, fallback no cache
async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName)

  try {
    const response = await fetch(request)
    if (response.ok && response.status < 400) {
      cache.put(request, response.clone()).catch(() => {})
    }
    return response
  } catch (err) {
    const cached = await cache.match(request)
    if (cached) return cached

    // Fallback final: index.html (SPA navigation)
    const indexCached = await cache.match('/')
    if (indexCached) return indexCached

    return new Response('Offline', { status: 503 })
  }
}

// === FETCH HANDLER ===
self.addEventListener('fetch', (event) => {
  const request = event.request

  // Só intercepta GET (deixa POST/PUT/DELETE passarem)
  if (request.method !== 'GET') return

  const url = new URL(request.url)

  // === ESTRATÉGIA 1: Assets com hash (cache eterno) ===
  // /assets/index-CnADk9_X.js → cache-first
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(resolveOrFallback(cacheFirst(request, STATIC_CACHE)))
    return
  }

  // === ESTRATÉGIA 2: Fonts (Google Fonts + local) ===
  if (
    url.hostname === 'fonts.googleapis.com' ||
    url.hostname === 'fonts.gstatic.com' ||
    url.pathname.startsWith('/fonts/')
  ) {
    event.respondWith(resolveOrFallback(cacheFirst(request, FONT_CACHE)))
    return
  }

  // === ESTRATÉGIA 3: Imagens (stale-while-revalidate) ===
  if (
    url.pathname.startsWith('/images/') ||
    url.pathname.match(/\.(png|jpg|jpeg|webp|avif|svg|gif|ico)$/i)
  ) {
    event.respondWith(resolveOrFallback(staleWhileRevalidate(request, IMAGE_CACHE)))
    return
  }

  // === ESTRATÉGIA 4: HTML / navegações (network-first) ===
  if (request.mode === 'navigate' || request.headers.get('Accept')?.includes('text/html')) {
    event.respondWith(resolveOrFallback(networkFirst(request, HTML_CACHE)))
    return
  }

  // === DEFAULT: passa pra network (não intercepta) ===
})

// === MESSAGE HANDLER ===
// Permite que a app peça pra limpar o cache (ex: após deploy)
self.addEventListener('message', (event) => {
  if (event.data?.type === 'CLEAR_CACHES') {
    event.waitUntil(
      (async () => {
        const cacheNames = await caches.keys()
        await Promise.all(
          cacheNames
            .filter((name) => name.startsWith('gaiatec-'))
            .map((name) => caches.delete(name))
        )
        // Notifica todos os clientes
        const clients = await self.clients.matchAll()
        for (const client of clients) {
          client.postMessage({ type: 'CACHES_CLEARED' })
        }
      })()
    )
  }

  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})
