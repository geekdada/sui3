import { useEffect, useState } from 'react'

function greetingForHour(hour: number): string {
  if (hour < 6) return 'Good night'
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

function formatDate(now: Date): string {
  return now.toLocaleDateString('en-GB', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function formatTime(now: Date): string {
  return now.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}

export default function Clock() {
  // null until mount — avoids SSR/client timezone mismatches
  const [now, setNow] = useState<Date | null>(null)

  useEffect(() => {
    setNow(new Date())
    const id = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(id)
  }, [])

  return (
    <div className="relative mb-8 pb-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <h1 className="m-0 text-3xl font-bold tracking-[-0.03em] sm:text-4xl">
          {now ? greetingForHour(now.getHours()) : '\u00a0'}
        </h1>
        <p className="m-0 font-mono text-3xl leading-none font-bold tabular-nums sm:text-4xl">
          {now ? formatTime(now) : '\u00a0'}
        </p>
      </div>
      <p className="label-brut m-0 mt-2 text-[0.7rem] text-muted-foreground">
        {now ? formatDate(now) : '\u00a0'}
      </p>
      {/* Black rule with an accent segment \u2014 the one non-monochrome mark up top. */}
      <span
        aria-hidden
        className="absolute bottom-0 left-0 h-[3px] w-full bg-foreground"
      />
      <span
        aria-hidden
        className="absolute bottom-0 left-0 h-[3px] w-24 bg-stroke"
      />
    </div>
  )
}
