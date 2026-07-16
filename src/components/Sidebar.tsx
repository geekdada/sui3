import { Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { cn } from '#/lib/cn'
import type { CategoryVisibility } from '#/lib/types'
import FeatherIcon from './FeatherIcon'

const ALL = 'all'

/** Minimal shape the sidebar reads — satisfied by both startpage and admin data. */
type SidebarCategory = {
  id: string
  name: string
  visibility: CategoryVisibility
  apps: unknown[]
}

export default function Sidebar({
  categories,
  authenticated,
}: {
  categories: SidebarCategory[]
  authenticated: boolean
}) {
  const [active, setActive] = useState<string>(ALL)
  const total = categories.reduce((sum, cat) => sum + cat.apps.length, 0)

  // Scroll-spy: highlight the topmost category section currently in view.
  useEffect(() => {
    const ids = categories.map((cat) => cat.id)
    const els = ids
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null)
    if (els.length === 0) return

    const visible = new Set<string>()
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.add(entry.target.id)
          else visible.delete(entry.target.id)
        }
        const firstVisible = ids.find((id) => visible.has(id))
        if (firstVisible) setActive(firstVisible)
        else if (window.scrollY < 120) setActive(ALL)
      },
      { rootMargin: '-64px 0px -60% 0px', threshold: 0 }
    )
    for (const el of els) observer.observe(el)
    return () => observer.disconnect()
  }, [categories])

  function jumpTo(id: string) {
    setActive(id)
    if (id === ALL) {
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    document
      .getElementById(id)
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <aside className="sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-[220px] shrink-0 overflow-y-auto border-r border-border px-3 py-4 md:block">
      <nav className="flex flex-col gap-1">
        <Link
          to="/"
          className="flex items-center gap-2 rounded-md border border-border bg-card px-2.5 py-1.5 text-sm font-medium text-foreground no-underline"
        >
          <FeatherIcon name="Grid" size={15} className="text-muted-foreground" />
          Home
        </Link>
        {authenticated ? (
          <Link
            to="/admin"
            className="flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5 text-sm text-muted-foreground no-underline transition hover:text-foreground"
          >
            <FeatherIcon name="Settings" size={15} />
            Admin
          </Link>
        ) : null}
      </nav>

      <p className="mt-6 mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        Categories
      </p>
      <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
        <li>
          <button
            type="button"
            onClick={() => jumpTo(ALL)}
            className={cn(
              'flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm text-muted-foreground transition hover:bg-background hover:text-foreground',
              active === ALL && 'bg-background font-medium text-foreground'
            )}
          >
            <span>All</span>
            <span className="font-mono text-xs tabular-nums">{total}</span>
          </button>
        </li>
        {categories.map((category) => (
          <li key={category.id}>
            <button
              type="button"
              onClick={() => jumpTo(category.id)}
              className={cn(
                'flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm text-muted-foreground transition hover:bg-background hover:text-foreground',
                active === category.id &&
                  'bg-background font-medium text-foreground'
              )}
            >
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="truncate">{category.name}</span>
                {category.visibility === 'auth' ? (
                  <FeatherIcon
                    name="Lock"
                    size={11}
                    className="shrink-0 opacity-70"
                  />
                ) : null}
              </span>
              <span className="font-mono text-xs tabular-nums">
                {category.apps.length}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </aside>
  )
}
