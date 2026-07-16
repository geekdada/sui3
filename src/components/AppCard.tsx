import { cn } from '#/lib/cn'
import type { StartpageApp } from './Startpage'

export default function AppCard({
  app,
  matched,
  tabIndex,
  label,
}: {
  app: StartpageApp
  matched: boolean
  tabIndex: number
  /** App name, possibly containing <em> search-highlight markup. */
  label: string
}) {
  return (
    <a
      data-app-id={app.id}
      href={app.url}
      target="_blank"
      rel="noreferrer"
      tabIndex={tabIndex}
      className={cn(
        'app-card flex flex-col gap-2 rounded-lg border border-border bg-card p-3 text-foreground no-underline transition hover:border-primary',
        matched && 'matched',
      )}
    >
      <span className="truncate font-mono text-xs text-muted-foreground">
        {app.domain}
      </span>

      <span className="flex items-center gap-2">
        <span
          className="shrink-0 text-muted-foreground [&_svg]:block [&_svg]:h-4 [&_svg]:w-4"
          dangerouslySetInnerHTML={{ __html: app.iconSvg }}
        />
        <span
          className="min-w-0 flex-1 truncate text-sm font-semibold"
          dangerouslySetInnerHTML={{ __html: label }}
        />
      </span>
    </a>
  )
}
