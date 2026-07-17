import { useEffect, useState } from 'react'
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerTitle,
  DrawerTrigger,
} from '#/components/ui/drawer'
import type {
  CacheActivityKind,
  CacheActivityMessage,
} from '#/lib/service-worker-messages'
import FeatherIcon from './FeatherIcon'
import {
  useServiceWorkerCache,
  type WorkerStatus,
} from './useServiceWorkerCache'

const statusLabels: Record<WorkerStatus, string> = {
  disabled: 'Disabled in development',
  unsupported: 'Not supported',
  registering: 'Starting service worker',
  ready: 'Service worker ready',
  'update-available': 'Update available',
  error: 'Service worker error',
}

const activityLabels: Record<CacheActivityKind, string> = {
  fetching: 'Fetching',
  fetched: 'Fetched and cached',
  'served-stale': 'Served stale data',
  revalidating: 'Revalidating',
  updated: 'Cache updated',
  unchanged: 'Cache unchanged',
  failed: 'Network failed',
}

const activityDotClass: Record<CacheActivityKind, string> = {
  fetching: 'bg-sky-500',
  fetched: 'bg-emerald-500',
  'served-stale': 'bg-amber-500',
  revalidating: 'bg-sky-500',
  updated: 'bg-emerald-500',
  unchanged: 'bg-muted-foreground',
  failed: 'bg-destructive',
}

function formatAge(milliseconds: number): string {
  if (milliseconds < 1_000) return 'just now'
  const seconds = Math.round(milliseconds / 1_000)
  if (seconds < 60) return `${seconds}s old`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m old`
  return `${Math.round(minutes / 60)}h old`
}

function formatActivityDetails(activity: CacheActivityMessage): string {
  const details = [activity.url]
  if (activity.status) details.push(String(activity.status))
  if (activity.durationMs !== undefined) {
    details.push(`${activity.durationMs}ms`)
  }
  if (activity.cacheAgeMs !== undefined) {
    details.push(formatAge(activity.cacheAgeMs))
  }
  return details.join(' · ')
}

export default function CacheActivity({
  authenticated,
  className,
}: {
  authenticated: boolean
  className: string
}) {
  const [open, setOpen] = useState(false)
  const {
    activities,
    applyUpdate,
    cacheEntries,
    clearActivities,
    error,
    inspectCaches,
    online,
    refreshData,
    status,
  } = useServiceWorkerCache(authenticated)

  useEffect(() => {
    if (!open || status === 'disabled' || status === 'unsupported') return
    void inspectCaches()
  }, [inspectCaches, open, status])

  const statusLabel = online ? statusLabels[status] : 'Offline'

  return (
    <Drawer open={open} onOpenChange={setOpen} swipeDirection="right">
      <DrawerTrigger
        aria-label="Open cache activity"
        title={statusLabel}
        className={className}
      >
        <FeatherIcon name={online ? 'Database' : 'WifiOff'} size={15} />
        <span className="hidden sm:inline">Cache</span>
        {activities.length > 0 ? (
          <span className="size-1.5 rounded-full bg-primary" />
        ) : null}
      </DrawerTrigger>
      <DrawerContent>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-start gap-3 border-b border-border p-4">
            <div className="min-w-0 flex-1">
              <DrawerTitle>Cache activity</DrawerTitle>
              <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                <FeatherIcon name={online ? 'Wifi' : 'WifiOff'} size={13} />
                {statusLabel}
              </p>
            </div>
            <DrawerClose
              aria-label="Close cache activity"
              className="rounded-md border border-border p-2 text-muted-foreground transition hover:border-primary hover:text-foreground"
            >
              <FeatherIcon name="X" size={15} />
            </DrawerClose>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {status === 'update-available' ? (
              <div className="mb-5 rounded-md border border-border bg-card p-3">
                <p className="m-0 text-sm font-medium">New version ready</p>
                <p className="mt-1 mb-3 text-xs text-muted-foreground">
                  Reload when you are ready to use the updated application.
                </p>
                <button
                  type="button"
                  onClick={applyUpdate}
                  className="inline-flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground"
                >
                  <FeatherIcon name="RefreshCw" size={13} />
                  Reload
                </button>
              </div>
            ) : null}

            {error ? (
              <p className="mb-5 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
                {error}
              </p>
            ) : null}

            <section>
              <div className="mb-2 flex items-center justify-between gap-3">
                <h3 className="m-0 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Recent requests
                </h3>
                {activities.length > 0 ? (
                  <button
                    type="button"
                    onClick={clearActivities}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    Clear
                  </button>
                ) : null}
              </div>
              {activities.length === 0 ? (
                <p className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
                  Cache fetches and background revalidations will appear here.
                </p>
              ) : (
                <ol className="m-0 flex list-none flex-col gap-2 p-0">
                  {activities.map((activity) => (
                    <li
                      key={activity.id}
                      className="rounded-md border border-border bg-card p-3"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={`size-2 shrink-0 rounded-full ${activityDotClass[activity.kind]}`}
                        />
                        <span className="text-sm font-medium">
                          {activityLabels[activity.kind]}
                        </span>
                        <time className="ml-auto text-[11px] text-muted-foreground tabular-nums">
                          {new Date(activity.timestamp).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                          })}
                        </time>
                      </div>
                      <p className="mt-1 mb-0 truncate font-mono text-[11px] text-muted-foreground">
                        {formatActivityDetails(activity)}
                      </p>
                    </li>
                  ))}
                </ol>
              )}
            </section>

            <section className="mt-6">
              <div className="mb-2 flex items-center justify-between gap-3">
                <h3 className="m-0 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Cached resources
                </h3>
                <button
                  type="button"
                  onClick={() => void inspectCaches()}
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  <FeatherIcon name="RefreshCw" size={12} />
                  Inspect
                </button>
              </div>
              {cacheEntries.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No managed cache entries yet.
                </p>
              ) : (
                <ul className="m-0 flex list-none flex-col gap-1 p-0">
                  {cacheEntries.map((entry) => (
                    <li
                      key={`${entry.cacheName}:${entry.url}`}
                      className="flex min-w-0 items-center gap-2 py-1 font-mono text-[11px]"
                    >
                      <span className="size-1.5 shrink-0 rounded-full bg-muted-foreground" />
                      <span className="truncate">{entry.url}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <div className="border-t border-border p-4">
            <button
              type="button"
              onClick={refreshData}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 text-sm text-muted-foreground transition hover:border-primary hover:text-foreground"
            >
              <FeatherIcon name="RefreshCw" size={14} />
              Refresh data
            </button>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  )
}
