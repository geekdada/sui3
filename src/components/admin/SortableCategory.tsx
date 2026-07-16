import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useEffect, useState } from 'react'
import { cn } from '#/lib/cn'
import type {
  AdminCategory,
  AppFormValues,
  CategoryVisibility,
  DecoratedApp,
} from '#/lib/types'
import FeatherIcon from '../FeatherIcon'
import SortableAppRow from './SortableAppRow'

const emptyApp: AppFormValues = { name: '', url: '', icon: 'box' }

const inputClass =
  'min-w-0 rounded-md border border-border bg-card px-2 py-1 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary'
const iconBtnClass =
  'inline-flex shrink-0 items-center justify-center rounded-md border border-border bg-card p-1.5 text-muted-foreground transition hover:border-primary hover:text-foreground'

export default function SortableCategory({
  category,
  onRename,
  onVisibility,
  onDelete,
  onAddApp,
  onEditApp,
  onDeleteApp,
}: {
  category: AdminCategory
  onRename: (cat: AdminCategory, name: string) => Promise<boolean>
  onVisibility: (
    cat: AdminCategory,
    visibility: CategoryVisibility,
  ) => Promise<boolean>
  onDelete: (cat: AdminCategory) => Promise<boolean>
  onAddApp: (categoryId: string, values: AppFormValues) => Promise<boolean>
  onEditApp: (app: DecoratedApp, values: AppFormValues) => Promise<boolean>
  onDeleteApp: (app: DecoratedApp) => Promise<boolean>
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: category.id, data: { type: 'category' } })
  const [name, setName] = useState(category.name)
  const [adding, setAdding] = useState(false)
  const [appForm, setAppForm] = useState<AppFormValues>(emptyApp)

  useEffect(() => setName(category.name), [category.name])

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  function commitName() {
    const next = name.trim()
    if (next && next !== category.name) onRename(category, next)
    else setName(category.name)
  }

  async function addApp() {
    if (!appForm.name.trim() || !appForm.url.trim() || !appForm.icon.trim()) return
    const ok = await onAddApp(category.id, {
      name: appForm.name.trim(),
      url: appForm.url.trim(),
      icon: appForm.icon.trim(),
    })
    if (ok) {
      setAppForm(emptyApp)
      setAdding(false)
    }
  }

  return (
    <section
      ref={setNodeRef}
      id={category.id}
      style={style}
      className={cn(
        'scroll-mt-20 rounded-lg border border-border bg-card',
        isDragging && 'opacity-40',
      )}
    >
      <header className="flex items-center gap-2 border-b border-border px-2 py-2">
        <button
          type="button"
          className="shrink-0 cursor-grab touch-none text-muted-foreground transition hover:text-foreground active:cursor-grabbing"
          aria-label="Drag category"
          {...attributes}
          {...listeners}
        >
          <FeatherIcon name="MoreVertical" size={16} />
        </button>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
            if (e.key === 'Escape') {
              setName(category.name)
              e.currentTarget.blur()
            }
          }}
          aria-label="Category name"
          className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1 py-0.5 text-sm font-semibold tracking-wide text-foreground uppercase outline-none hover:border-border focus:border-primary"
        />
        <select
          value={category.visibility}
          onChange={(e) =>
            onVisibility(category, e.target.value as CategoryVisibility)
          }
          aria-label="Visibility"
          className="shrink-0 rounded-md border border-border bg-card px-2 py-1 text-xs text-muted-foreground outline-none focus:border-primary"
        >
          <option value="public">public</option>
          <option value="auth">private</option>
        </select>
        <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
          {category.apps.length}
        </span>
        <button
          type="button"
          onClick={() => onDelete(category)}
          className={cn(iconBtnClass, 'hover:border-match hover:text-match')}
          aria-label="Delete category"
        >
          <FeatherIcon name="Trash2" size={16} />
        </button>
      </header>

      <div className="p-2">
        <SortableContext
          items={category.apps.map((a) => a.id)}
          strategy={verticalListSortingStrategy}
        >
          <ul className="flex flex-col gap-1">
            {category.apps.map((app) => (
              <SortableAppRow
                key={app.id}
                app={app}
                onEdit={onEditApp}
                onDelete={onDeleteApp}
              />
            ))}
          </ul>
        </SortableContext>

        {adding ? (
          <div className="mt-2 flex items-center gap-2">
            <input
              value={appForm.name}
              onChange={(e) =>
                setAppForm((f) => ({ ...f, name: e.target.value }))
              }
              placeholder="Name"
              className={cn(inputClass, 'flex-1')}
              aria-label="New app name"
              autoFocus
            />
            <input
              value={appForm.url}
              onChange={(e) => setAppForm((f) => ({ ...f, url: e.target.value }))}
              placeholder="URL"
              className={cn(inputClass, 'flex-[2]')}
              aria-label="New app URL"
            />
            <input
              value={appForm.icon}
              onChange={(e) =>
                setAppForm((f) => ({ ...f, icon: e.target.value }))
              }
              placeholder="icon"
              className={cn(inputClass, 'w-20')}
              aria-label="New app icon"
            />
            <button
              type="button"
              onClick={addApp}
              className={iconBtnClass}
              aria-label="Add app"
            >
              <FeatherIcon name="Check" size={16} />
            </button>
            <button
              type="button"
              onClick={() => {
                setAppForm(emptyApp)
                setAdding(false)
              }}
              className={iconBtnClass}
              aria-label="Cancel"
            >
              <FeatherIcon name="X" size={16} />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="mt-2 flex w-full items-center gap-1.5 rounded-md border border-dashed border-border px-2 py-1.5 text-sm text-muted-foreground transition hover:border-primary hover:text-foreground"
          >
            <FeatherIcon name="Plus" size={15} />
            Add app
          </button>
        )}
      </div>
    </section>
  )
}
