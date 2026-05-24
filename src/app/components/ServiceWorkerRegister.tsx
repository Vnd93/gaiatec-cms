import { useEffect } from 'react'

/**
 * Registra o Service Worker em produção.
 *
 * Em dev (Vite), não registra para não interferir com HMR.
 * Em prod, registra `/sw.js` na raiz e gerencia atualizações automáticas.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    // Só registra em produção
    if (!import.meta.env.PROD) return
    if (!('serviceWorker' in navigator)) return

    const register = async () => {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js', {
          scope: '/',
          updateViaCache: 'none', // Sempre busca a versão mais recente do sw.js
        })

        // Quando há um novo SW esperando para ativar, pula a fila
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing
          if (!newWorker) return

          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // Há um novo SW disponível — manda ele assumir imediatamente
              newWorker.postMessage({ type: 'SKIP_WAITING' })
            }
          })
        })

        // Recarrega a página quando o novo SW assume controle
        // (garante que o usuário vê a versão mais nova após deploy)
        let refreshing = false
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          if (refreshing) return
          refreshing = true
          window.location.reload()
        })

        // Verifica updates a cada 60 minutos enquanto a aba está aberta
        setInterval(() => {
          registration.update().catch(() => {})
        }, 60 * 60 * 1000)
      } catch (err) {
        console.warn('[SW] Failed to register:', err)
      }
    }

    // Registra após o load para não competir com recursos críticos
    if (document.readyState === 'complete') {
      register()
    } else {
      window.addEventListener('load', register, { once: true })
    }
  }, [])

  return null
}

/**
 * Helper para forçar limpeza de todos os caches do SW.
 * Chamar após mudanças críticas (ex: bug em produção, novo deploy).
 */
export async function clearServiceWorkerCaches(): Promise<void> {
  if (!('serviceWorker' in navigator)) return

  const registration = await navigator.serviceWorker.getRegistration()
  if (!registration?.active) return

  registration.active.postMessage({ type: 'CLEAR_CACHES' })
}
