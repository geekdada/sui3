import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useState } from 'react'
import { cn } from '#/lib/cn'
import type { AppFormValues, DecoratedApp } from '#/lib/types'
import FeatherIcon from '../FeatherIcon'

const inputClass =
  'min-w-0 rounded-md border border-border bg-card px-2 py-1 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary'
const iconBtnClass =
  'inline-flex shrink-0 items-center justify-center rounded-md border border-border bg-card p-1.5 text-muted-foreground transition hover:border-primary hover:text-foreground'

export default function SortableAppRow({
  app,
  onEdit,
  onDelete,
}: {
  app: DecoratedApp
  onEdit: (app: DecoratedApp, values: AppFormValues) => Promise<boolean>
  onDelete: (app: DecoratedApp) => Promise<boolean>
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: app.id, data: { type: 'app' } })
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<AppFormValues>({
    name: app.name,
    url: app.url,
    icon: app.icon,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  async function save() {
    if (!form.name.trim() || !form.url.trim() || !form.icon.trim()) return
    const ok = await onEdit(app, {
      name: form.name.trim(),
      url: form.url.trim(),
      icon: form.icon.trim(),
    })
    if (ok) setEditing(false)
  }

  function cancel() {
    setForm({ name: app.name, url: app.url, icon: app.icon })
    setEditing(false)
  }

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex items-center gap-2 rounded-md border border-border bg-card px-2 py-1.5',
        isDragging && 'opacity-40',
      )}
    >
      <button
        type="button"
        className="shrink-0 cursor-grab touch-none text-muted-foreground transition hover:text-foreground active:cursor-grabbing"
        aria-label="Drag app"
        {...attributes}
        {...listeners}
      >
        <FeatherIcon name="MoreVertical" size={16} />
      </button>

      <span
        className="shrink-0 text-muted-foreground [&_svg]:block [&_svg]:h-4 [&_svg]:w-4"
        dangerouslySetInnerHTML={{ __html: app.iconSvg }}
      />

      {editing ? (
        <>
          <input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="Name"
            className={cn(inputClass, 'w-32 flex-1')}
            aria-label="App name"
          />
          <input
            value={form.url}
            onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
            placeholder="URL"
            className={cn(inputClass, 'w-40 flex-[2]')}
            aria-label="App URL"
          />
          <input
            value={form.icon}
            onChange={(e) => setForm((f) => ({ ...f, icon: e.target.value }))}
            placeholder="icon"
            className={cn(inputClass, 'w-20')}
            aria-label="App icon"
          />
          <button
            type="button"
            onClick={save}
            className={iconBtnClass}
            aria-label="Save app"
          >
            <FeatherIcon name="Check" size={16} />
          </button>
          <button
            type="button"
            onClick={cancel}
            className={iconBtnClass}
            aria-label="Cancel edit"
          >
            <FeatherIcon name="X" size={16} />
          </button>
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="flex min-w-0 flex-1 items-baseline gap-2 text-left"
            title="Edit"
          >
            <span className="truncate text-sm font-medium">{app.name}</span>
            <span className="truncate font-mono text-xs text-muted-foreground">
              {app.domain}
            </span>
          </button>
          <button
            type="button"
            onClick={() => onDelete(app)}
            className={cn(iconBtnClass, 'hover:border-match hover:text-match')}
            aria-label="Delete app"
          >
            <FeatherIcon name="Trash2" size={16} />
          </button>
        </>
      )}
    </li>
  )
}
