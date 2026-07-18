import { useCallback, useEffect, useRef, useState } from 'react'
import { SKIP_WAITING_MESSAGE } from '#/lib/service-worker-messages'
import { useServiceWorker } from './useServiceWorker'

export function useServiceWorkerUpdate(onUpdateAvailable: () => void) {
  const { online, registrationRef, status } = useServiceWorker(false)
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const reloadOnControllerChangeRef = useRef(false)
  const onUpdateAvailableRef = useRef(onUpdateAvailable)

  useEffect(() => {
    onUpdateAvailableRef.current = onUpdateAvailable
  }, [onUpdateAvailable])

  useEffect(() => {
    if (status !== 'update-available') {
      setUpdateAvailable(false)
      return
    }
    if (!online) return
    setUpdateAvailable(true)
    onUpdateAvailableRef.current()
  }, [online, status])

  useEffect(() => {
    const onControllerChange = () => {
      if (reloadOnControllerChangeRef.current) {
        window.location.reload()
      }
    }
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange)
    return () => {
      navigator.serviceWorker.removeEventListener(
        'controllerchange',
        onControllerChange,
      )
    }
  }, [])

  const applyUpdate = useCallback(() => {
    const waiting = registrationRef.current?.waiting
    if (!waiting) return
    reloadOnControllerChangeRef.current = true
    waiting.postMessage({ type: SKIP_WAITING_MESSAGE })
  }, [registrationRef])

  return { applyUpdate, online, status, updateAvailable }
}
