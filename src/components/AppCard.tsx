import { cn } from '#/lib/cn'
import AppIcon from './AppIcon'
import type { StartpageApp } from './Startpage'

export default function AppCard({
  app,
  matched,
  label,
}: {
  app: StartpageApp
  matched: boolean
  /** App name, possibly containing <em> search-highlight markup. */
  label: string
}) {
  return (
    <a
      data-app-id={app.id}
      href={app.url}
      target="_blank"
      rel="noreferrer"
      className={cn(
        'app-card flex flex-col gap-2 rounded-lg border border-border bg-card p-3 text-foreground no-underline transition hover:border-primary hover:bg-secondary/60 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        matched && 'matched',
      )}
    >
      <span className="truncate font-mono text-xs text-muted-foreground">
        {app.domain}
      </span>

      <span className="flex items-center gap-2">
        <AppIcon icon={app.icon} className="text-muted-foreground" />
        <span
          className="min-w-0 flex-1 truncate text-sm font-semibold"
          dangerouslySetInnerHTML={{ __html: label }}
        />
      </span>
    </a>
  )
}
