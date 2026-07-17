import { useRouter } from '@tanstack/react-router'
import {
  startTransition,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import {
  CACHE_INSPECT_MESSAGE,
  SKIP_WAITING_MESSAGE,
  isCacheActivityMessage,
  isCacheSnapshotResponse,
  type CacheActivityMessage,
  type CacheSnapshotEntry,
} from '#/lib/service-worker-messages'

const MAX_ACTIVITY = 50

export type WorkerStatus =
  | 'disabled'
  | 'unsupported'
  | 'registering'
  | 'ready'
  | 'update-available'
  | 'error'

async function inspectWorkerCaches(
  registration: ServiceWorkerRegistration | null,
): Promise<CacheSnapshotEntry[]> {
  const worker = navigator.serviceWorker.controller ?? registration?.active
  if (!worker) return []

  return new Promise((resolve) => {
    const channel = new MessageChannel()
    const timeout = window.setTimeout(() => resolve([]), 2_000)
    channel.port1.onmessage = (event: MessageEvent<unknown>) => {
      window.clearTimeout(timeout)
      resolve(isCacheSnapshotResponse(event.data) ? event.data.entries : [])
    }
    worker.postMessage({ type: CACHE_INSPECT_MESSAGE }, [channel.port2])
  })
}

export function useServiceWorkerCache(authenticated: boolean) {
  const router = useRouter()
  const [online, setOnline] = useState(true)
  const [status, setStatus] = useState<WorkerStatus>('registering')
  const [activities, setActivities] = useState<CacheActivityMessage[]>([])
  const [cacheEntries, setCacheEntries] = useState<CacheSnapshotEntry[]>([])
  const [error, setError] = useState<string | null>(null)
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null)
  const authenticatedRef = useRef(authenticated)
  const reloadOnControllerChangeRef = useRef(false)
  const refreshedEventIdsRef = useRef(new Set<string>())
  const primedAnonymousDataRef = useRef(false)

  const refreshData = useCallback(() => {
    startTransition(() => {
      void router.invalidate()
    })
  }, [router])

  useEffect(() => {
    authenticatedRef.current = authenticated
  }, [authenticated])

  useEffect(() => {
    setOnline(navigator.onLine)
    if (!import.meta.env.PROD) {
      setStatus('disabled')
      return
    }
    if (!('serviceWorker' in navigator)) {
      setStatus('unsupported')
      return
    }

    let mounted = true

    const primeAnonymousData = () => {
      if (
        authenticatedRef.current ||
        primedAnonymousDataRef.current ||
        !navigator.serviceWorker.controller
      ) {
        return
      }
      primedAnonymousDataRef.current = true
      refreshData()
    }
    const onOnline = () => setOnline(true)
    const onOffline = () => setOnline(false)
    const onControllerChange = () => {
      if (reloadOnControllerChangeRef.current) {
        window.location.reload()
        return
      }
      primeAnonymousData()
    }
    const onMessage = (event: MessageEvent<unknown>) => {
      if (!isCacheActivityMessage(event.data)) return
      const activity = event.data
      setActivities((current) => [activity, ...current].slice(0, MAX_ACTIVITY))

      if (
        activity.kind === 'updated' &&
        !authenticatedRef.current &&
        !refreshedEventIdsRef.current.has(activity.id)
      ) {
        refreshedEventIdsRef.current.add(activity.id)
        refreshData()
      }
    }

    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    navigator.serviceWorker.addEventListener('message', onMessage)
    navigator.serviceWorker.addEventListener(
      'controllerchange',
      onControllerChange,
    )

    void navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((registration) => {
        if (!mounted) return
        registrationRef.current = registration

        const updateStatus = () => {
          if (!mounted) return
          if (registration.waiting && navigator.serviceWorker.controller) {
            setStatus('update-available')
          } else if (registration.active) {
            setStatus('ready')
          }
        }
        const watchInstallingWorker = () => {
          const installing = registration.installing
          if (!installing) return
          installing.addEventListener('statechange', updateStatus)
        }

        registration.addEventListener('updatefound', watchInstallingWorker)
        watchInstallingWorker()
        updateStatus()
        void registration.update()
        void navigator.serviceWorker.ready.then(() => {
          if (mounted) primeAnonymousData()
        })
      })
      .catch((registrationError: unknown) => {
        if (!mounted) return
        setStatus('error')
        setError(
          registrationError instanceof Error
            ? registrationError.message
            : 'Registration failed',
        )
      })

    return () => {
      mounted = false
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
      navigator.serviceWorker.removeEventListener('message', onMessage)
      navigator.serviceWorker.removeEventListener(
        'controllerchange',
        onControllerChange,
      )
    }
  }, [refreshData])

  const inspectCaches = useCallback(async () => {
    const entries = await inspectWorkerCaches(registrationRef.current)
    setCacheEntries(entries)
  }, [])

  const applyUpdate = useCallback(() => {
    const waiting = registrationRef.current?.waiting
    if (!waiting) return
    reloadOnControllerChangeRef.current = true
    waiting.postMessage({ type: SKIP_WAITING_MESSAGE })
  }, [])

  return {
    activities,
    applyUpdate,
    cacheEntries,
    clearActivities: () => setActivities([]),
    error,
    inspectCaches,
    online,
    refreshData,
    status,
  }
}
