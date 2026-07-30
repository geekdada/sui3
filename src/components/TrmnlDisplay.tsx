import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useServerFn } from '@tanstack/react-start'
import { useEffect, useRef, useState } from 'react'
import FeatherIcon from '#/components/FeatherIcon'
import { Button } from '#/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from '#/components/ui/popover'
import { Skeleton } from '#/components/ui/skeleton'
import { Spinner } from '#/components/ui/spinner'
import { trmnlDisplayQueryOptions } from '#/lib/queries'
import { forceRefreshTrmnlFn } from '#/lib/trmnl.functions'
import { cn } from '#/lib/utils'

const POLL_INTERVAL_MS = 5_000
const MAX_POLL_DURATION_MS = 2 * 60_000
const EXPIRY_BUFFER_MS = 1_000

function formatNextRefresh(expiresAt: number, nowMs: number): string {
  const seconds = Math.max(0, Math.round(expiresAt - nowMs / 1000))
  if (seconds < 60) return `in ${seconds}s`
  const minutes = Math.round(seconds / 60)
  if (minutes < 90) return `in ~${minutes} min`
  return `in ~${Math.round(minutes / 60)} h`
}

/** TRMNL e-ink screen mirror. The server only reads D1 for the status and
 * refreshes the cached image in the background, so this component polls while
 * the cached image is overdue and swaps the <img> once a new fetch lands. */
export default function TrmnlDisplay() {
  const queryClient = useQueryClient()
  const forceRefresh = useServerFn(forceRefreshTrmnlFn)
  const pollStartedAtRef = useRef<number | null>(null)
  const [infoOpen, setInfoOpen] = useState(false)
  const [nowMs, setNowMs] = useState(0)
  const [advancing, setAdvancing] = useState(false)
  const [advanceError, setAdvanceError] = useState<string | null>(null)
  const [loadedAt, setLoadedAt] = useState<number | null>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)

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
  const mode = data?.mode ?? null
  const expired = configured && (data?.expired || !data?.hasImage)
  const expiresAt = data?.expiresAt ?? null
  const fetchedAt = data?.fetchedAt ?? null
  const imageLoaded = fetchedAt !== null && loadedAt === fetchedAt

  // Schedule the next refresh at expiresAt: invalidate the status query, the
  // server kicks off a background refresh, and the poll picks up the new image.
  useEffect(() => {
    if (!configured || !expiresAt) return
    const delay = Math.max(
      expiresAt * 1000 - Date.now() + EXPIRY_BUFFER_MS,
      EXPIRY_BUFFER_MS
    )
    const id = window.setTimeout(() => {
      void queryClient.invalidateQueries({ queryKey: ['trmnl', 'display'] })
    }, delay)
    return () => window.clearTimeout(id)
  }, [configured, expiresAt, queryClient])

  // A cached image can finish loading before hydration attaches onLoad;
  // treat an already-complete img as loaded so the skeleton cannot stick.
  useEffect(() => {
    const img = imgRef.current
    if (img?.complete && img.naturalWidth > 0) setLoadedAt(fetchedAt)
  }, [fetchedAt])

  // Keep the popover's relative "next refresh" text honest while it is open.
  useEffect(() => {
    if (!infoOpen) return
    setNowMs(Date.now())
    const id = window.setInterval(() => setNowMs(Date.now()), 15_000)
    return () => window.clearInterval(id)
  }, [infoOpen])

  async function advanceNow() {
    setAdvancing(true)
    setAdvanceError(null)
    try {
      await forceRefresh()
      await queryClient.invalidateQueries({ queryKey: ['trmnl'] })
    } catch (error) {
      setAdvanceError(
        error instanceof Error ? error.message : 'TRMNL request failed'
      )
    } finally {
      setAdvancing(false)
    }
  }

  if (!configured) return null

  return (
    <div className="mb-8">
      {fetchedAt !== null ? (
        <>
          <div className="relative w-full max-w-[800px] border ">
            <img
              key={fetchedAt}
              ref={imgRef}
              src={`/api/trmnl/display?v=${fetchedAt}`}
              alt="TRMNL screen"
              onLoad={() => setLoadedAt(fetchedAt)}
              // The screen is 1-bit black-on-white, so a straight inversion keeps
              // it from glaring in dark mode. The panel is natively 800x480 —
              // the same 5/3 the skeleton assumes. Until the bytes arrive the img
              // is parked off-flow (still fetching) so the frame never collapses.
              className={cn(
                'block h-auto w-full dark:invert',
                !imageLoaded && 'invisible absolute inset-0'
              )}
            />
            {imageLoaded ? null : (
              <Skeleton className="aspect-[5/3] w-full" aria-hidden />
            )}
            {expired ? (
              <span className="absolute top-2 left-2 flex items-center gap-1.5 bg-background/90 px-2 py-1 font-mono text-[0.65rem] tracking-[0.08em] text-foreground uppercase">
                <Spinner size={12} data-icon="inline-start" />
                Refreshing
              </span>
            ) : null}
          </div>
          <Popover open={infoOpen} onOpenChange={setInfoOpen}>
            <div>
              <PopoverTrigger
                render={<Button variant="ghost" size="xs" className="" />}
              >
                <FeatherIcon name="Terminal" size={16} />
                More info
              </PopoverTrigger>
            </div>

            <PopoverContent side="top" align="start" className="w-64">
              <PopoverHeader>
                <PopoverTitle>TRMNL</PopoverTitle>
                <PopoverDescription>
                  {mode === 'device'
                    ? 'Device mode activated.'
                    : 'Mirroring a physical device.'}
                </PopoverDescription>
              </PopoverHeader>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">
                  Next refresh
                </span>
                <span className="font-mono text-xs tabular-nums">
                  {expired || expiresAt === null
                    ? 'Refreshing…'
                    : formatNextRefresh(expiresAt, nowMs || Date.now())}
                </span>
              </div>

              {mode === 'device' ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={advancing}
                  onClick={() => void advanceNow()}
                >
                  {advancing ? <Spinner data-icon="inline-start" /> : null}
                  Advance now
                </Button>
              ) : null}
              {advanceError ? (
                <p className="m-0 text-xs text-destructive">{advanceError}</p>
              ) : null}
            </PopoverContent>
          </Popover>
        </>
      ) : (
        <div className="flex aspect-[5/3] w-full max-w-md items-center justify-center gap-2 border bg-card text-sm text-muted-foreground">
          <Spinner size={14} data-icon="inline-start" />
          Refreshing screen…
        </div>
      )}
    </div>
  )
}
