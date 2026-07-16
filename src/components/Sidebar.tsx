import { Link } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { cn } from '#/lib/cn'
import type { CategoryVisibility } from '#/lib/types'
import {
  Drawer,
  DrawerContent,
  DrawerTitle,
  DrawerTrigger,
} from '#/components/ui/drawer'
import FeatherIcon from './FeatherIcon'

const ALL = 'all'

const navLinkClass =
  'flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5 text-sm no-underline transition hover:border-primary hover:text-foreground'
const navLinkActiveProps = {
  className: 'bg-card font-medium text-foreground',
}
const navLinkInactiveProps = { className: 'text-muted-foreground' }

/** Minimal shape the sidebar reads — satisfied by both startpage and admin data. */
type SidebarCategory = {
  id: string
  name: string
  visibility: CategoryVisibility
  apps: unknown[]
}

/**
 * Presentational nav body — rendered both in the desktop `<aside>` and inside
 * the mobile drawer. Kept free of DOM `id`s so it is safe to render twice.
 */
function CategoryNav({
  categories,
  authenticated,
  active,
  onJump,
  onNavigate,
}: {
  categories: SidebarCategory[]
  authenticated: boolean
  active: string
  onJump: (id: string) => void
  onNavigate?: () => void
}) {
  const total = categories.reduce((sum, cat) => sum + cat.apps.length, 0)

  return (
    <>
      <nav className="flex flex-col gap-1">
        <Link
          to="/"
          onClick={onNavigate}
          activeOptions={{ exact: true }}
          activeProps={navLinkActiveProps}
          inactiveProps={navLinkInactiveProps}
          className={navLinkClass}
        >
          <FeatherIcon name="Grid" size={15} />
          Home
        </Link>
        {authenticated ? (
          <Link
            to="/admin"
            onClick={onNavigate}
            activeOptions={{ exact: true }}
            activeProps={navLinkActiveProps}
            inactiveProps={navLinkInactiveProps}
            className={navLinkClass}
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
            onClick={() => onJump(ALL)}
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
              onClick={() => onJump(category.id)}
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
    </>
  )
}

export default function Sidebar({
  categories,
  authenticated,
}: {
  categories: SidebarCategory[]
  authenticated: boolean
}) {
  const [active, setActive] = useState<string>(ALL)
  const [open, setOpen] = useState(false)
  // Deferred scroll target: the page scroll is locked while the modal drawer is
  // open, so we jump only after it has finished closing (onOpenChangeComplete).
  const pendingJump = useRef<string | null>(null)

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

  // Close the drawer if the viewport grows to the desktop breakpoint, so a
  // scroll-locked drawer never lingers alongside the now-visible aside.
  useEffect(() => {
    const mql = window.matchMedia('(min-width: 768px)')
    const onChange = () => {
      if (mql.matches) setOpen(false)
    }
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])

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
    <>
      <aside className="sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-[220px] shrink-0 overflow-y-auto border-r border-border px-3 py-4 md:block">
        <CategoryNav
          categories={categories}
          authenticated={authenticated}
          active={active}
          onJump={jumpTo}
        />
      </aside>

      <Drawer
        open={open}
        onOpenChange={(next) => setOpen(next)}
        swipeDirection="left"
        onOpenChangeComplete={(isOpen) => {
          if (!isOpen && pendingJump.current) {
            jumpTo(pendingJump.current)
            pendingJump.current = null
          }
        }}
      >
        <DrawerTrigger
          aria-label="Open navigation"
          className="fixed bottom-5 left-4 z-40 flex size-11 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-lg transition hover:border-primary md:hidden"
        >
          <FeatherIcon name="Menu" size={18} />
        </DrawerTrigger>
        <DrawerContent>
          <DrawerTitle className="sr-only">Navigation</DrawerTitle>
          <div className="flex-1 overflow-y-auto px-3 py-4">
            <CategoryNav
              categories={categories}
              authenticated={authenticated}
              active={active}
              onJump={(id) => {
                pendingJump.current = id
                setOpen(false)
              }}
              onNavigate={() => setOpen(false)}
            />
          </div>
        </DrawerContent>
      </Drawer>
    </>
  )
}
