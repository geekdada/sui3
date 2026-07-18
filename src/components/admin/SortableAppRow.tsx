import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useForm } from '@tanstack/react-form'
import { useEffect, useState } from 'react'
import { cn } from '#/lib/cn'
import type { AppFormValues, DecoratedApp } from '#/lib/types'
import { CompactFormField } from '#/components/FormField'
import { appFormSchema } from '#/lib/form-schemas'
import { Button } from '../ui/button'
import AppIcon from '../AppIcon'
import FeatherIcon from '../FeatherIcon'

const inputBaseClass = 'h-8 px-2.5 py-1 text-sm'
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
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: app.id, data: { type: 'app' } })

  const [editing, setEditing] = useState(false)

  const form = useForm({
    defaultValues: {
      name: app.name,
      url: app.url,
      icon: app.icon,
    },
    validators: {
      onChange: appFormSchema,
    },
    onSubmit: async ({ value }) => {
      const ok = await onEdit(app, {
        name: value.name.trim(),
        url: value.url.trim(),
        icon: value.icon.trim(),
      })
      if (ok) {
        setEditing(false)
      } else {
        form.reset()
      }
    },
  })

  useEffect(() => {
    if (!editing) form.reset()
  }, [app.name, app.url, app.icon, editing, form])

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  function cancel() {
    form.reset()
    setEditing(false)
  }

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex items-center gap-2 rounded-md border border-border bg-card px-2 py-1.5',
        isDragging && 'opacity-40'
      )}
    >
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        className="shrink-0 cursor-grab touch-none text-muted-foreground hover:text-foreground active:cursor-grabbing"
        aria-label="Drag app"
        {...attributes}
        {...listeners}
      >
        <FeatherIcon name="MoreVertical" size={16} />
      </Button>

      {editing ? (
        <form
          onSubmit={(event) => {
            event.preventDefault()
            event.stopPropagation()
            void form.handleSubmit()
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault()
              cancel()
            }
          }}
          className="flex min-w-0 flex-1 items-start gap-2"
        >
          <form.Field name="icon">
            {(field) => (
              <CompactFormField
                field={field}
                label="App icon"
                className="w-20 shrink-0"
                inputProps={{
                  placeholder: 'Icon',
                  className: inputBaseClass,
                }}
              />
            )}
          </form.Field>
          <form.Field name="name">
            {(field) => (
              <CompactFormField
                field={field}
                label="App name"
                className="min-w-0 flex-1"
                inputProps={{
                  placeholder: 'Name',
                  autoFocus: true,
                  className: inputBaseClass,
                }}
              />
            )}
          </form.Field>
          <form.Field name="url">
            {(field) => (
              <CompactFormField
                field={field}
                label="App URL"
                className="min-w-0 flex-[2]"
                inputProps={{
                  placeholder: 'URL',
                  className: inputBaseClass,
                }}
              />
            )}
          </form.Field>
          <Button
            type="submit"
            variant="outline"
            className={iconBtnClass}
            aria-label="Save app"
          >
            <FeatherIcon name="Check" size={16} />
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={cancel}
            className={iconBtnClass}
            aria-label="Cancel edit"
          >
            <FeatherIcon name="X" size={16} />
          </Button>
        </form>
      ) : (
        <>
          <AppIcon icon={app.icon} className="text-muted-foreground" />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setEditing(true)}
            className="flex min-w-0 flex-1 items-center justify-start gap-2 text-left"
            title="Edit"
          >
            <span className="truncate text-sm font-medium">{app.name}</span>
            <span className="truncate font-mono text-xs text-muted-foreground">
              {app.domain}
            </span>
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onDelete(app)}
            className={cn(iconBtnClass, 'hover:border-match hover:text-match')}
            aria-label="Delete app"
          >
            <FeatherIcon name="Trash2" size={16} />
          </Button>
        </>
      )}
    </li>
  )
}
