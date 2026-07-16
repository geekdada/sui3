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
    <div className="mb-6 flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <h1 className="m-0 text-xl font-semibold tracking-tight">
        {now ? greetingForHour(now.getHours()) : '\u00a0'}
      </h1>
      <p className="m-0 text-sm text-muted-foreground">
        {now ? formatDate(now) : '\u00a0'}
      </p>
      <p className="m-0 font-mono text-sm text-muted-foreground">
        {now ? formatTime(now) : '\u00a0'}
      </p>
    </div>
  )
}
