import { useEffect } from 'react'

export function shouldReloadForServiceWorkerTakeover(
  hadPreviousController: boolean,
  refreshing: boolean,
): boolean {
  return hadPreviousController && !refreshing
}

export function createServiceWorkerControllerChangeHandler(
  controlledInitially: boolean,
  hasController: () => boolean,
  reload: () => void,
): () => void {
  let controlled = controlledInitially
  let refreshing = false
  return () => {
    const hadPreviousController = controlled
    controlled = hasController()
    if (!shouldReloadForServiceWorkerTakeover(hadPreviousController, refreshing)) return
    refreshing = true
    reload()
  }
}

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

    let disposed = false
    let activeRegistration: ServiceWorkerRegistration | undefined
    let updateInterval: ReturnType<typeof setInterval> | undefined
    let onUpdateFound: (() => void) | undefined

    // O primeiro install também dispara `controllerchange` por causa de
    // clients.claim(). Nesse caso a página já carregou os bytes atuais e
    // não deve ser interrompida. Reload só é necessário em uma atualização.
    const handleControllerChange = createServiceWorkerControllerChangeHandler(
      Boolean(navigator.serviceWorker.controller),
      () => Boolean(navigator.serviceWorker.controller),
      () => window.location.reload(),
    )
    const onControllerChange = () => {
      if (!disposed) handleControllerChange()
    }
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange)

    const register = async () => {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js', {
          scope: '/',
          updateViaCache: 'none', // Sempre busca a versão mais recente do sw.js
        })
        if (disposed) return
        activeRegistration = registration

        // Quando há um novo SW esperando para ativar, pula a fila
        onUpdateFound = () => {
          const newWorker = registration.installing
          if (!newWorker) return

          newWorker.addEventListener('statechange', () => {
            if (!disposed && newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // Há um novo SW disponível — manda ele assumir imediatamente
              newWorker.postMessage({ type: 'SKIP_WAITING' })
            }
          })
        }
        registration.addEventListener('updatefound', onUpdateFound)

        // Verifica updates a cada 60 minutos enquanto a aba está aberta
        updateInterval = setInterval(() => {
          registration.update().catch(() => {})
        }, 60 * 60 * 1000)
      } catch (err) {
        console.warn('[SW] Failed to register:', err)
      }
    }

    // Registra após o load para não competir com recursos críticos
    if (document.readyState === 'complete') {
      void register()
    } else {
      window.addEventListener('load', register, { once: true })
    }

    return () => {
      disposed = true
      window.removeEventListener('load', register)
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange)
      if (activeRegistration && onUpdateFound)
        activeRegistration.removeEventListener('updatefound', onUpdateFound)
      if (updateInterval) clearInterval(updateInterval)
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
