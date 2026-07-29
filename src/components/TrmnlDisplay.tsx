import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { Spinner } from '#/components/ui/spinner'
import { trmnlDisplayQueryOptions } from '#/lib/queries'

const POLL_INTERVAL_MS = 5_000
const MAX_POLL_DURATION_MS = 2 * 60_000
const EXPIRY_BUFFER_MS = 1_000

/** TRMNL e-ink screen mirror. The server only reads D1 for the status and
 * refreshes the cached image in the background, so this component polls while
 * the cached image is overdue and swaps the <img> once a new fetch lands. */
export default function TrmnlDisplay() {
  const queryClient = useQueryClient()
  const pollStartedAtRef = useRef<number | null>(null)

  const { data } = useQuery({
    ...trmnlDisplayQueryOptions(),
    refetchInterval: (query) => {
      const state = query.state.data
      if (!state?.configured || (!state.expired && state.hasImage)) {
        pollStartedAtRef.current = null
        return false
      }
      if (pollStartedAtRef.current === null) {
        pollStartedAtRef.current = Date.now()
      }
      if (Date.now() - pollStartedAtRef.current > MAX_POLL_DURATION_MS) {
        return false
      }
      return POLL_INTERVAL_MS
    },
  })

  const configured = data?.configured ?? false
  const expired = configured && (data?.expired || !data?.hasImage)
  const expiresAt = data?.expiresAt ?? null
  const fetchedAt = data?.fetchedAt ?? null

  // Schedule the next refresh at expiresAt: invalidate the status query, the
  // server kicks off a background refresh, and the poll picks up the new image.
  useEffect(() => {
    if (!configured || !expiresAt) return
    const delay = Math.max(
      expiresAt * 1000 - Date.now() + EXPIRY_BUFFER_MS,
      EXPIRY_BUFFER_MS,
    )
    const id = window.setTimeout(() => {
      void queryClient.invalidateQueries({ queryKey: ['trmnl', 'display'] })
    }, delay)
    return () => window.clearTimeout(id)
  }, [configured, expiresAt, queryClient])

  if (!configured) return null

  return (
    <div className="mb-8">
      {fetchedAt !== null ? (
        <div className="relative inline-block max-w-full">
          <img
            key={fetchedAt}
            src={`/api/trmnl/display?v=${fetchedAt}`}
            alt="TRMNL screen"
            // The screen is 1-bit black-on-white, so a straight inversion is
            // enough to keep it from glaring in dark mode.
            // Never upscale past the panel's native 800x480 — an e-ink screen
            // stretched wide just looks like a rendering bug. Same 5/3 panel the
            // loading placeholder below assumes.
            className="block h-auto max-w-[min(100%,800px)] border-1 border-border dark:invert"
          />
          {expired ? (
            <span className="absolute top-2 left-2 flex items-center gap-1.5 bg-background/90 px-2 py-1 font-mono text-[0.65rem] tracking-[0.08em] text-foreground uppercase">
              <Spinner size={12} data-icon="inline-start" />
              Refreshing
            </span>
          ) : null}
        </div>
      ) : (
        <div className="flex aspect-[5/3] w-full max-w-md items-center justify-center gap-2 border-1 border-border bg-card text-sm text-muted-foreground">
          <Spinner size={14} data-icon="inline-start" />
          Refreshing screen…
        </div>
      )}
    </div>
  )
}
