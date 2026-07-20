import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { isCacheActivityMessage } from '#/lib/service-worker-messages'

export type WorkerStatus =
  | 'disabled'
  | 'unsupported'
  | 'registering'
  | 'ready'
  | 'update-available'
  | 'error'

export function useServiceWorker(authenticated: boolean) {
  const queryClient = useQueryClient()
  const [online, setOnline] = useState(true)
  const [status, setStatus] = useState<WorkerStatus>('registering')
  const [error, setError] = useState<string | null>(null)
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null)
  const authenticatedRef = useRef(authenticated)
  const primedAnonymousDataRef = useRef(false)
  const refreshedEventIdsRef = useRef(new Set<string>())

  const refreshData = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['startpage'] })
  }, [queryClient])

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
    const onControllerChange = () => primeAnonymousData()
    const onMessage = (event: MessageEvent<unknown>) => {
      if (!isCacheActivityMessage(event.data)) return
      const activity = event.data
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

  return { error, online, registrationRef, status }
}
