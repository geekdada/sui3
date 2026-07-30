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
  // The card lifts on hover; the wrapper keeps a stationary hover target so
  // the pointer never falls off the edge the card just moved away from.
  return (
    <div className="group flex">
      <a
        data-app-id={app.id}
        href={app.url}
        target="_blank"
        rel="noreferrer"
        className={cn(
          'app-card flex min-w-0 flex-1 flex-col gap-2 border bg-card p-3 text-foreground no-underline transition-[box-shadow,transform,background-color] duration-75 focus-visible:ring-3 focus-visible:ring-ring group-hover:-translate-x-[2px] group-hover:-translate-y-[2px] group-hover:shadow-brut',
          matched && 'matched'
        )}
      >
        <span className="truncate font-mono text-[0.7rem] text-muted-foreground">
          {app.domain}
        </span>

        <span className="flex items-center gap-2">
          <AppIcon icon={app.icon} />
          <span
            className="min-w-0 flex-1 truncate text-sm font-semibold tracking-tight"
            dangerouslySetInnerHTML={{ __html: label }}
          />
        </span>
      </a>
    </div>
  )
}
