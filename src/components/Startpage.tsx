import Fuse from 'fuse.js'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import AppCard from './AppCard'
import FeatherIcon from './FeatherIcon'

export type StartpageApp = {
  id: string
  name: string
  url: string
  icon: string
  domain: string
}

export type StartpageCategory = {
  id: string
  name: string
  visibility: 'public' | 'auth'
  emptyMessage?: string
  apps: StartpageApp[]
}

type SearchItem = {
  id: string
  name: string
}

export default function Startpage({
  categories,
}: {
  categories: StartpageCategory[]
}) {
  const [keyword, setKeyword] = useState('')
  const [matchedIds, setMatchedIds] = useState<string[]>([])
  const [highlights, setHighlights] = useState<Record<string, string>>({})
  const inputRef = useRef<HTMLInputElement>(null)

  const flat = useMemo(
    () =>
      categories.flatMap((cat) =>
        cat.apps.map((app) => ({ id: app.id, name: app.name }))
      ),
    [categories]
  )

  const fuse = useMemo(
    () =>
      new Fuse<SearchItem>(flat, {
        keys: ['name'],
        includeScore: true,
        includeMatches: true,
        minMatchCharLength: 1,
        threshold: 0.2,
      }),
    [flat]
  )

  // Type-anywhere search: build the keyword from key presses outside inputs.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey) return
      const target = e.target as HTMLElement | null
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return
      }
      const key = e.keyCode || e.which
      if (key === 9 || key === 13) return

      setKeyword((prev) => {
        let next = prev
        if (key === 8) next = prev.slice(0, -1)
        else if (key === 27) next = ''
        else {
          const char = String.fromCharCode(
            96 <= key && key <= 105 ? key - 48 : key
          )
          if (/\w/.test(char)) next = prev + char
        }
        return next
      })
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    if (!keyword) {
      setMatchedIds([])
      setHighlights({})
      return
    }

    const results = fuse.search(keyword)
    const ids = results.map((r) => r.item.id)
    setMatchedIds(ids)

    const nextHighlights: Record<string, string> = {}
    for (const result of results) {
      const match = result.matches?.[0]
      if (!match) continue
      const indices = [...match.indices].sort(
        (a, b) => b[1] - b[0] - (a[1] - a[0])
      )
      const [start, end] = indices[0]
      const text = match.value ?? result.item.name
      nextHighlights[result.item.id] =
        `${text.slice(0, start)}<em>${text.slice(start, end + 1)}</em>${text.slice(end + 1)}`
    }
    setHighlights(nextHighlights)

    if (ids[0] && document.activeElement !== inputRef.current) {
      const el = document.querySelector<HTMLElement>(
        `[data-app-id="${ids[0]}"]`
      )
      el?.focus()
    }
  }, [keyword, fuse])

  return (
    <div>
      <div className="relative mb-6 max-w-md">
        <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground">
          <FeatherIcon name="Search" size={15} />
        </span>
        <input
          ref={inputRef}
          type="text"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="Search apps… (or just start typing)"
          aria-label="Search apps"
          className="w-full rounded-md border border-border bg-card py-2 pr-3 pl-9 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
        />
      </div>

      {categories.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No apps yet. Log in and import your data from Admin.
        </p>
      ) : (
        categories.map((category) => (
          <section
            key={category.id}
            id={category.id}
            className="mb-10 scroll-mt-20"
          >
            <div className="mb-3 flex items-baseline gap-2">
              <h2 className="m-0 text-sm font-semibold  text-muted-foreground">
                {category.name}
              </h2>
              {category.visibility === 'auth' ? (
                <Badge variant="secondary">private</Badge>
              ) : null}
            </div>
            {category.apps.length === 0 && category.emptyMessage ? (
              <p className="text-sm text-muted-foreground">
                {category.emptyMessage}
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
                {category.apps.map((app) => {
                  const matched = matchedIds.includes(app.id)
                  const label = highlights[app.id] ?? app.name
                  return (
                    <AppCard
                      key={app.id}
                      app={app}
                      matched={matched}
                      tabIndex={matched ? matchedIds.indexOf(app.id) + 1 : 0}
                      label={label}
                    />
                  )
                })}
              </div>
            )}
          </section>
        ))
      )}
    </div>
  )
}
