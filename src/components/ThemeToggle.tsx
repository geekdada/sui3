import { useEffect, useState } from 'react'
import FeatherIcon from './FeatherIcon'

const modes = ['light', 'dark', 'auto'] as const
type Mode = (typeof modes)[number]

function applyTheme(mode: Mode) {
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  const resolved = mode === 'auto' ? (prefersDark ? 'dark' : 'light') : mode
  const root = document.documentElement
  root.classList.remove('light', 'dark')
  root.classList.add(resolved)
  if (mode === 'auto') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', mode)
  root.style.colorScheme = resolved
}

function iconFor(mode: Mode) {
  if (mode === 'light') return 'Sun' as const
  if (mode === 'dark') return 'Moon' as const
  return 'Monitor' as const
}

export default function ThemeToggle() {
  const [mode, setMode] = useState<Mode>('auto')

  useEffect(() => {
    const stored = window.localStorage.getItem('theme')
    const next =
      stored === 'light' || stored === 'dark' || stored === 'auto'
        ? stored
        : 'auto'
    setMode(next)
    applyTheme(next)
  }, [])

  return (
    <button
      type="button"
      className="inline-flex items-center justify-center rounded-md border border-border bg-card p-2 text-muted-foreground transition hover:border-primary hover:text-foreground"
      onClick={() => {
        const idx = modes.indexOf(mode)
        const next = modes[(idx + 1) % modes.length]
        setMode(next)
        window.localStorage.setItem('theme', next)
        applyTheme(next)
      }}
      aria-label={`Theme: ${mode}`}
      title={`Theme: ${mode}`}
    >
      <FeatherIcon name={iconFor(mode)} size={15} />
    </button>
  )
}
